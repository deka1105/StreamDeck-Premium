package expo.modules.deskassistandroid

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.provider.Settings
import android.view.KeyEvent
import android.view.WindowManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only phone features for the panel: volume keys that flip pages,
 * kiosk (home screen, pinning, full screen), keep awake, ambient light and
 * proximity, battery temperature, clipboard, and the notification mirror.
 */
class DeskAssistAndroidModule : Module() {
  companion object {
    @Volatile var instance: DeskAssistAndroidModule? = null
  }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No Android context.")
  private val activity: Activity?
    get() = appContext.activityProvider?.currentActivity

  private var sensors: SensorManager? = null
  private var lightListener: SensorEventListener? = null
  private var proximityListener: SensorEventListener? = null
  private var lastLightAt = 0L

  fun emit(name: String, payload: Map<String, Any?>) {
    try {
      sendEvent(name, payload)
    } catch (_: Exception) {
      // No JS listener (app in the background): drop it.
    }
  }

  private fun onUi(block: (Activity) -> Unit) {
    val a = activity ?: return
    a.runOnUiThread { block(a) }
  }

  private fun sensorManager(): SensorManager =
    sensors ?: (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).also { sensors = it }

  private fun stopSensors() {
    lightListener?.let { sensorManager().unregisterListener(it) }
    proximityListener?.let { sensorManager().unregisterListener(it) }
    lightListener = null
    proximityListener = null
  }

  override fun definition() = ModuleDefinition {
    Name("DeskAssistAndroid")
    Events("onVolumeKey", "onNotification", "onLight", "onProximity")

    OnCreate { instance = this@DeskAssistAndroidModule }
    OnDestroy {
      if (instance === this@DeskAssistAndroidModule) instance = null
      VolumeKeys.enabled = false
      stopSensors()
    }

    // ---- volume keys ----
    Function("setVolumeKeyPaging") { on: Boolean -> VolumeKeys.enabled = on }

    // ---- kiosk ----
    Function("isDefaultHome") {
      val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      val info = context.packageManager.resolveActivity(intent, 0)
      info?.activityInfo?.packageName == context.packageName
    }
    Function("openHomeSettings") {
      context.startActivity(Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    Function("setImmersive") { on: Boolean ->
      onUi { a ->
        val c = WindowCompat.getInsetsController(a.window, a.window.decorView)
        if (on) {
          c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          c.hide(WindowInsetsCompat.Type.systemBars())
        } else c.show(WindowInsetsCompat.Type.systemBars())
      }
    }
    Function("setPinned") { on: Boolean ->
      onUi { a ->
        try {
          if (on) a.startLockTask() else a.stopLockTask()
        } catch (_: Exception) {
        }
      }
    }
    Function("setKeepScreenOn") { on: Boolean ->
      onUi { a ->
        if (on) a.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else a.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
    // -1 = follow the system; 0..1 = this window's brightness.
    Function("setWindowBrightness") { value: Double ->
      onUi { a ->
        val lp = a.window.attributes
        lp.screenBrightness = if (value < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else value.coerceIn(0.01, 1.0).toFloat()
        a.window.attributes = lp
      }
    }

    // ---- sensors ----
    Function("hasSensor") { kind: String ->
      sensorManager().getDefaultSensor(if (kind == "proximity") Sensor.TYPE_PROXIMITY else Sensor.TYPE_LIGHT) != null
    }
    Function("setLightUpdates") { on: Boolean ->
      lightListener?.let { sensorManager().unregisterListener(it) }
      lightListener = null
      val s = sensorManager().getDefaultSensor(Sensor.TYPE_LIGHT)
      if (on && s != null) {
        val l = object : SensorEventListener {
          override fun onSensorChanged(e: SensorEvent) {
            val now = System.currentTimeMillis()
            if (now - lastLightAt < 1000) return
            lastLightAt = now
            emit("onLight", mapOf("lux" to e.values[0].toDouble()))
          }
          override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        sensorManager().registerListener(l, s, SensorManager.SENSOR_DELAY_NORMAL)
        lightListener = l
      }
    }
    Function("setProximityUpdates") { on: Boolean ->
      proximityListener?.let { sensorManager().unregisterListener(it) }
      proximityListener = null
      val s = sensorManager().getDefaultSensor(Sensor.TYPE_PROXIMITY)
      if (on && s != null) {
        val l = object : SensorEventListener {
          override fun onSensorChanged(e: SensorEvent) {
            emit("onProximity", mapOf("near" to (e.values[0] < s.maximumRange)))
          }
          override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        sensorManager().registerListener(l, s, SensorManager.SENSOR_DELAY_NORMAL)
        proximityListener = l
      }
    }

    // ---- battery ----
    Function("batteryTemperature") {
      val i = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val t = i?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE) ?: Int.MIN_VALUE
      if (t == Int.MIN_VALUE) null else t / 10.0
    }

    // ---- clipboard ----
    Function("getClipboard") {
      val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString() ?: ""
    }
    Function("setClipboard") { text: String ->
      val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      cm.setPrimaryClip(ClipData.newPlainText("DeskAssist", text))
    }

    // ---- notification mirror ----
    Function("notificationAccess") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }
    Function("openNotificationAccess") {
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    Function("setNotificationMirror") { on: Boolean -> NotificationMirror.enabled = on }
  }
}

/** Called from MainActivity.dispatchKeyEvent (added by the app's config plugin). */
object VolumeKeys {
  @Volatile var enabled = false

  @JvmStatic
  fun handle(event: KeyEvent): Boolean {
    if (!enabled) return false
    val up = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP
    if (!up && event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) return false
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
      DeskAssistAndroidModule.instance?.emit("onVolumeKey", mapOf("direction" to if (up) "up" else "down"))
    }
    return true // the key flips pages instead of changing the volume
  }
}

object NotificationMirror {
  @Volatile var enabled = false
}
