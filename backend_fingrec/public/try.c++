#include <WiFi.h>
#include <ArduinoOTA.h>
#include <Adafruit_Fingerprint.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <LiquidCrystal_I2C.h>

// ====================== STORAGE ======================
Preferences preferences;

// ====================== KONFIGURASI MQTT & SENSOR ======================
char mqtt_server[40]  = "192.168.1.100";
char mqtt_port_str[6] = "1883";
char mqtt_user[32]    = "esp32client";
char mqtt_pass[32]    = "tryfinggas";
char sensor_id[8]     = "01";

// ====================== MQTT TOPICS ======================
String topic_login;
String topic_register;
String topic_status;
String topic_restore;
String topic_command;
String topic_display;
String topic_sensorinfo;
String topic_slots;

void updateTopics() {
  String sid = String(sensor_id);
  topic_login      = "absensi/" + sid + "/login";
  topic_register   = "absensi/" + sid + "/register";
  topic_status     = "absensi/" + sid + "/status";
  topic_restore    = "absensi/" + sid + "/restore";
  topic_command    = "absensi/" + sid + "/command";
  topic_display    = "absensi/" + sid + "/display";
  topic_sensorinfo = "absensi/" + sid + "/sensorinfo";
  topic_slots      = "absensi/" + sid + "/slots";
}

// ====================== HARDWARE ======================
WiFiClient espClient;
PubSubClient mqttClient(espClient);

#define RX2_PIN     16
#define TX2_PIN     17
#define BUZZER_PIN   4
#define LCD_ADDRESS  0x27
#define LCD_COLUMNS  16
#define LCD_ROWS      2

HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLUMNS, LCD_ROWS);

bool isLoginMode = true;
unsigned long lastReconnectAttempt = 0;
unsigned long lastScanCooldown = 0;

unsigned long timerResetLCD = 0;
bool butuhResetLCD = false;

// ====================== LCD & BUZZER ======================
void lcdPrint(String line1, String line2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(line1.substring(0, LCD_COLUMNS));
  if (line2.length() > 0) {
    lcd.setCursor(0, 1); lcd.print(line2.substring(0, LCD_COLUMNS));
  }
}

void lcdStatus(String status, bool withAnimation = false) {
  if (withAnimation) {
    for (int i = 0; i <= 3; i++) {
      lcd.clear(); lcd.setCursor(0, 0); lcd.print(status);
      for (int j = 0; j < i; j++) { lcd.setCursor(status.length() + j, 0); lcd.print("."); }
      delay(300);
    }
  } else { lcdPrint(status); }
}

void buzzerSukses() {
  digitalWrite(BUZZER_PIN, HIGH); delay(100); digitalWrite(BUZZER_PIN, LOW); delay(100);
  digitalWrite(BUZZER_PIN, HIGH); delay(150); digitalWrite(BUZZER_PIN, LOW);
}
void buzzerGagal() {
  digitalWrite(BUZZER_PIN, HIGH); delay(600); digitalWrite(BUZZER_PIN, LOW);
}
void buzzerNotif() {
  digitalWrite(BUZZER_PIN, HIGH); delay(50); digitalWrite(BUZZER_PIN, LOW);
}

// ====================== HELPER MODE LOGIN ======================
void kembalikanKeModeLogin() {
  isLoginMode = true;
  lastScanCooldown = millis();
  lcdPrint("Mode: LOGIN", "Tempelkan Jari");
}

// ====================== HELPER PUBLISH STATUS ======================
// Format: {"status":"success","command":"xxx","message":"xxx"}
void publishStatus(String status, String command, String message) {
  String payload = "{\"status\":\"" + status + "\",\"command\":\"" + command + "\",\"message\":\"" + message + "\"}";
  mqttClient.publish(topic_status.c_str(), payload.c_str());
}

// ====================== LOAD & SAVE CONFIG ======================
void loadConfig() {
  preferences.begin("fingrec", true);
  String s;
  s = preferences.getString("mqtt_server", String(mqtt_server)); s.toCharArray(mqtt_server, sizeof(mqtt_server));
  s = preferences.getString("mqtt_port",   String(mqtt_port_str)); s.toCharArray(mqtt_port_str, sizeof(mqtt_port_str));
  s = preferences.getString("mqtt_user",   String(mqtt_user)); s.toCharArray(mqtt_user, sizeof(mqtt_user));
  s = preferences.getString("mqtt_pass",   String(mqtt_pass)); s.toCharArray(mqtt_pass, sizeof(mqtt_pass));
  s = preferences.getString("sensor_id",   String(sensor_id)); s.toCharArray(sensor_id, sizeof(sensor_id));
  preferences.end();
}

void saveConfig() {
  preferences.begin("fingrec", false);
  preferences.putString("mqtt_server", String(mqtt_server));
  preferences.putString("mqtt_port",   String(mqtt_port_str));
  preferences.putString("mqtt_user",   String(mqtt_user));
  preferences.putString("mqtt_pass",   String(mqtt_pass));
  preferences.putString("sensor_id",   String(sensor_id));
  preferences.end();
  Serial.println("Config tersimpan.");
}

// ====================== SETUP WIFI ======================
void setupWiFiAndConfig() {
  WiFiManager wm;
  // wm.resetSettings();
  WiFiManagerParameter param_sensor_id  ("sensor_id",   "Sensor ID",      sensor_id,    8);
  WiFiManagerParameter param_mqtt_server("mqtt_server", "MQTT Server IP", mqtt_server,  40);
  WiFiManagerParameter param_mqtt_port  ("mqtt_port",   "MQTT Port",      mqtt_port_str, 6);
  WiFiManagerParameter param_mqtt_user  ("mqtt_user",   "MQTT Username",  mqtt_user,    32);
  WiFiManagerParameter param_mqtt_pass  ("mqtt_pass",   "MQTT Password",  mqtt_pass,    32);

  wm.addParameter(&param_sensor_id);
  wm.addParameter(&param_mqtt_server);
  wm.addParameter(&param_mqtt_port);
  wm.addParameter(&param_mqtt_user);
  wm.addParameter(&param_mqtt_pass);

  wm.setConfigPortalTimeout(180);
  wm.setAPCallback([](WiFiManager* wm) {
    lcdPrint("Setup Mode", "192.168.4.1");
  });

  lcdPrint("Connecting WiFi", "Please wait...");
  bool connected = wm.autoConnect("ESP_FingerRec", "Bismillah");

  if (!connected) {
    lcdPrint("WiFi Gagal!", "Restart...");
    delay(3000);
    ESP.restart();
  }

  strncpy(sensor_id,     param_sensor_id.getValue(),   sizeof(sensor_id)     - 1);
  strncpy(mqtt_server,   param_mqtt_server.getValue(), sizeof(mqtt_server)   - 1);
  strncpy(mqtt_port_str, param_mqtt_port.getValue(),   sizeof(mqtt_port_str) - 1);
  strncpy(mqtt_user,     param_mqtt_user.getValue(),   sizeof(mqtt_user)     - 1);
  strncpy(mqtt_pass,     param_mqtt_pass.getValue(),   sizeof(mqtt_pass)     - 1);

  saveConfig();
  updateTopics();

  Serial.println("WiFi connected: " + WiFi.localIP().toString());
}

// ====================== INFO & SLOTS HELPERS ======================
void publishSensorInfo() {
  JsonDocument doc;
  doc["sensor_id"] = String(sensor_id);
  String payload;
  serializeJson(doc, payload);
  mqttClient.publish(topic_sensorinfo.c_str(), payload.c_str());
  publishStatus("success", "get_sensor_id", "berhasil membaca sensor ID");
}

void publishSlots() {
  lcdPrint("Scanning Slots", "Please wait...");
  String slotList = "[";
  bool first = true;
  for (int id = 1; id <= 999; id++) {
    if (finger.loadModel(id) == FINGERPRINT_OK) {
      if (!first) slotList += ",";
      slotList += String(id);
      first = false;
    }
  }
  slotList += "]";

  String payload = "{\"sensor_id\":\"" + String(sensor_id) + "\",\"slots\":" + slotList + "}";

  if (mqttClient.beginPublish(topic_slots.c_str(), payload.length(), false)) {
    mqttClient.print(payload);
    mqttClient.endPublish();
    lcdPrint("Slots Terkirim", "Selesai!");
    buzzerSukses();
    publishStatus("success", "get_slots", "berhasil membaca slot memori");
  } else {
    lcdPrint("Gagal Kirim", "Buffer Penuh");
    buzzerGagal();
    publishStatus("fail", "get_slots", "gagal mengirim data slots");
  }
}

// ====================== MQTT RECONNECT ======================
void mqttReconnect() {
  if (mqttClient.connected()) return;
  if (millis() - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = millis();

  lcdPrint("MQTT Connecting", String(mqtt_server));
  String clientId = "ESP32-" + String(sensor_id) + "-" + String(random(100, 999));

  if (mqttClient.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
    mqttClient.subscribe(topic_restore.c_str());
    mqttClient.subscribe(topic_command.c_str());
    mqttClient.subscribe(topic_display.c_str());

    lcdPrint("MQTT Connected", "ID: " + String(sensor_id));
    delay(1000);

    publishSensorInfo();

    if (isLoginMode) lcdPrint("Mode: LOGIN", "Tempelkan Jari");
    lastReconnectAttempt = 0;
  } else {
    Serial.print("Gagal Connect, Status State: ");
    Serial.println(mqttClient.state());
    lcdPrint("MQTT Gagal", "Error: " + String(mqttClient.state()));
  }
}

// ====================== MQTT CALLBACK ======================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();

  // ------------------------------------------------
  // TOPIC: /display
  // ------------------------------------------------
  if (String(topic) == topic_display) {
    JsonDocument doc;
    if (!deserializeJson(doc, msg)) {
      String line1  = doc["line1"]  | "";
      String line2  = doc["line2"]  | "";
      String buzzer = doc["buzzer"] | "";

      lcdPrint(line1, line2);

      if      (buzzer == "sukses") buzzerSukses();
      else if (buzzer == "gagal")  buzzerGagal();
      else if (buzzer == "notif")  buzzerNotif();
      else if (buzzer == "")       digitalWrite(BUZZER_PIN, LOW);

      timerResetLCD = millis();
      butuhResetLCD = true;
    }
  }

  // ------------------------------------------------
  // TOPIC: /restore
  // Tiap template: kirim fail jika gagal, lanjut jika sukses
  // Feedback akhir dikirim via command upload_done
  // ------------------------------------------------
  else if (String(topic) == topic_restore) {
    JsonDocument doc;
    if (!deserializeJson(doc, msg)) {
      int targetId   = doc["template_id"];
      String hexTemp = doc["template"];
      isLoginMode = false;
      lcdPrint("Restoring ID:" + String(targetId), "Please wait...");

      bool ok = suntikTemplateKeSensor(targetId, hexTemp);
      if (!ok) {
        // Gagal inject template ini → kirim fail, lanjut ke template berikutnya
        publishStatus("fail", "restore", "gagal mengirim template ID " + String(targetId));
      }
      // Jika sukses → diam saja, lanjut terima template berikutnya
    }
  }

  // ------------------------------------------------
  // TOPIC: /command
  // ------------------------------------------------
  else if (String(topic) == topic_command) {
    JsonDocument doc;
    if (deserializeJson(doc, msg)) return;

    String command = doc["command"] | "";
    Serial.println(">>> Command masuk: " + command);

    isLoginMode = false;

    // ── REGISTER ──────────────────────────────────
    if (command == "register") {
      int idBaru = cariIdKosong();
      if (idBaru == -1) {
        lcdPrint("Memori Penuh!", "Hapus Data Dulu");
        buzzerGagal();
        publishStatus("fail", "register", "memori sensor penuh");
      } else {
        lcdPrint("Mode Daftar", "Tempelkan Jari");
        buzzerNotif();
        prosesRegister(idBaru);
      }
    }

    // ── UPLOAD DONE (akhir restore) ───────────────
    else if (command == "upload_done") {
      lcdPrint("Upload Selesai!", "Semua Data Aman");
      buzzerSukses();
      publishStatus("success", "upload_done", "semua template berhasil direstore");
    }

    // ── DELETE ALL ────────────────────────────────
    else if (command == "delete_all") {
      lcdPrint("WARNING!", "Deleting ALL...");
      delay(1000);
      if (finger.emptyDatabase() == FINGERPRINT_OK) {
        lcdPrint("Success!", "All Deleted");
        buzzerSukses();
        publishStatus("success", "delete_all", "berhasil menghapus semua data");
      } else {
        lcdPrint("Failed!", "Cannot Delete");
        buzzerGagal();
        publishStatus("fail", "delete_all", "gagal menghapus semua data");
      }
    }

    // ── DELETE SATUAN ─────────────────────────────
    else if (command == "delete") {
      int targetId = doc["template_id"] | -1;
      if (targetId == -1) {
        lcdPrint("Gagal!", "ID Tidak Valid");
        buzzerGagal();
        publishStatus("fail", "delete", "template_id tidak valid");
      } else {
        lcdPrint("Deleting ID:" + String(targetId), "Please wait...");
        if (finger.deleteModel(targetId) == FINGERPRINT_OK) {
          lcdPrint("Deleted!", "ID: " + String(targetId));
          buzzerSukses();
          publishStatus("success", "delete", "berhasil menghapus ID " + String(targetId));
        } else {
          lcdPrint("Gagal!", "ID: " + String(targetId));
          buzzerGagal();
          publishStatus("fail", "delete", "gagal menghapus ID " + String(targetId));
        }
      }
    }

    // ── GET SENSOR ID ─────────────────────────────
    else if (command == "get_sensor_id") {
      publishSensorInfo(); // publishStatus sudah ada di dalam publishSensorInfo()
    }

    // ── GET SLOTS ─────────────────────────────────
    else if (command == "get_slots") {
      publishSlots(); // publishStatus sudah ada di dalam publishSlots()
    }

    kembalikanKeModeLogin();
  }
}

// ====================== FINGERPRINT HELPERS ======================
int cariIdKosong() {
  lcdPrint("Mencari Memori", "Please Wait...");
  for (int id = 1; id <= 999; id++) {
    if (finger.loadModel(id) != FINGERPRINT_OK) return id;
  }
  return -1;
}

void cekSidikJariContinuous() {
  if (finger.getImage() != FINGERPRINT_OK) return;

  delay(100);

  if (finger.getImage() != FINGERPRINT_OK) return;
  if (finger.image2Tz() != FINGERPRINT_OK) return;

  if (finger.fingerSearch() == FINGERPRINT_OK) {
    int matchedId = finger.fingerID;
    buzzerNotif();

    lcdPrint("Memproses...", "Please Wait");

    String payload = "{\"template_id\":" + String(matchedId) + "}";
    mqttClient.publish(topic_login.c_str(), payload.c_str());

    lastScanCooldown = millis();

    while (finger.getImage() == FINGERPRINT_OK) {
      delay(50);
      mqttClient.loop();
    }
    kembalikanKeModeLogin();
  } else {
    lcdPrint("Miss Match", "Please retry");
    buzzerGagal();
    kembalikanKeModeLogin();
  }
}

void prosesRegister(int id) {
  // ── STEP 1: Tempel jari pertama ──
  unsigned long t = millis(); bool ok1 = false;
  while (millis() - t < 15000) {
    mqttClient.loop();
    ArduinoOTA.handle();
    if (finger.getImage() == FINGERPRINT_OK && finger.image2Tz(1) == FINGERPRINT_OK) { ok1 = true; break; }
    delay(50);
  }
  if (!ok1) {
    lcdPrint("Timeout!", "Batal Daftar");
    buzzerGagal();
    publishStatus("fail", "register", "timeout, jari tidak terdeteksi");
    return;
  }

  // ── STEP 2: Angkat & tempel jari kedua ──
  lcdPrint("Angkat Jari", "Tempelkan Lagi");
  buzzerNotif();
  delay(1000);

  t = millis(); bool ok2 = false;
  while (millis() - t < 15000) {
    mqttClient.loop();
    ArduinoOTA.handle();
    if (finger.getImage() == FINGERPRINT_OK && finger.image2Tz(2) == FINGERPRINT_OK) { ok2 = true; break; }
    delay(50);
  }
  if (!ok2) {
    lcdPrint("Timeout!", "Batal Daftar");
    buzzerGagal();
    publishStatus("fail", "register", "timeout, jari kedua tidak terdeteksi");
    return;
  }

  // ── STEP 3: Buat model & simpan ──
  lcdStatus("Menyimpan...", true);
  if (finger.createModel() != FINGERPRINT_OK) {
    lcdPrint("Gagal!", "Jari Tdk Cocok");
    buzzerGagal();
    publishStatus("fail", "register", "jari tidak cocok, gagal membuat model");
    return;
  }
  if (finger.storeModel(id) != FINGERPRINT_OK) {
    lcdPrint("Gagal!", "Simpan Error");
    buzzerGagal();
    publishStatus("fail", "register", "gagal menyimpan ke sensor");
    return;
  }

  // ── STEP 4: Upload template ke server ──
  lcdPrint("Tersimpan Lokal", "Upload ke DB...");
  kirimTemplateViaMQTT(id);
}

void kirimTemplateViaMQTT(int id) {
  if (finger.loadModel(id) != FINGERPRINT_OK || finger.getModel() != FINGERPRINT_OK) {
    lcdPrint("Upload Gagal", "Load Error");
    buzzerGagal();
    publishStatus("fail", "register", "gagal membaca template dari sensor");
    return;
  }

  String templateHex = "";
  templateHex.reserve(1024);

  uint32_t start = millis(); int count = 0;
  while (count < 512 && (millis() - start) < 3000) {
    if (mySerial.available()) {
      uint8_t b = mySerial.read();
      if (b < 16) templateHex += "0";
      templateHex += String(b, HEX);
      count++;
    }
  }
  templateHex.toUpperCase();

  String payload = "{\"template_id\":" + String(id) + ",\"template\":\"" + templateHex + "\"}";
  if (mqttClient.beginPublish(topic_register.c_str(), payload.length(), false)) {
    mqttClient.print(payload);
    mqttClient.endPublish();
    lcdPrint("Selesai!", "Data Terkirim");
    buzzerSukses();
    publishStatus("success", "register", "sidik jari berhasil didaftarkan");
  } else {
    lcdPrint("Upload Gagal", "Buffer Penuh");
    buzzerGagal();
    publishStatus("fail", "register", "gagal upload template ke server");
  }
}

bool suntikTemplateKeSensor(int id, String hexTemplate) {
  if (hexTemplate.length() != 1024) return false;
  uint8_t templateBuffer[512];
  for (int i = 0; i < 512; i++) {
    templateBuffer[i] = (uint8_t) strtol(hexTemplate.substring(i*2, i*2+2).c_str(), NULL, 16);
  }
  uint8_t cmdPacket[] = {0xEF,0x01,0xFF,0xFF,0xFF,0xFF,0x01,0x00,0x04,0x0B,0x01,0x00,0x11};
  mySerial.write(cmdPacket, 13); delay(50); while(mySerial.available()) mySerial.read();
  for (int i = 0; i < 4; i++) {
    uint8_t pid = (i == 3) ? 0x08 : 0x02; uint16_t length = 130;
    uint8_t header[] = {0xEF,0x01,0xFF,0xFF,0xFF,0xFF,pid,(uint8_t)(length>>8),(uint8_t)(length&0xFF)};
    mySerial.write(header, 9);
    uint16_t sum = pid + (length>>8) + (length&0xFF);
    for (int j = 0; j < 128; j++) { uint8_t b = templateBuffer[i*128+j]; mySerial.write(b); sum += b; }
    mySerial.write((uint8_t)(sum>>8)); mySerial.write((uint8_t)(sum&0xFF)); delay(50);
  }
  while(mySerial.available()) mySerial.read();
  return finger.storeModel(id) == FINGERPRINT_OK;
}

// ====================== SETUP & LOOP ======================
void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  lcd.init();
  lcd.backlight();
  lcdPrint("System Starting");
  delay(1000);

  loadConfig();
  updateTopics();
  setupWiFiAndConfig();

  int port = atoi(mqtt_port_str);
  mqttClient.setBufferSize(4096);
  mqttClient.setServer(mqtt_server, port);
  mqttClient.setCallback(mqttCallback);

  ArduinoOTA.setHostname(("ESP-" + String(sensor_id)).c_str());
  ArduinoOTA.begin();

  mySerial.begin(57600, SERIAL_8N1, RX2_PIN, TX2_PIN);
  finger.begin(57600);

  lcdPrint("Ready!", "ID: " + String(sensor_id));
  delay(2000);
}

void loop() {
  ArduinoOTA.handle();
  mqttReconnect();
  mqttClient.loop();

  if (isLoginMode && mqttClient.connected() && (millis() - lastScanCooldown > 1000)) {
    cekSidikJariContinuous();
  }

    if (isLoginMode && butuhResetLCD && (millis() - timerResetLCD > 3000)) {
      delay(100);
    kembalikanKeModeLogin();
    butuhResetLCD = false; // matikan alarm
  }
}


