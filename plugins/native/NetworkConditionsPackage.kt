package com.elijah77.social.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager

class NetworkConditionsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) =
    listOf(NetworkConditionsModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext):
    List<ViewManager<*, *>> = emptyList()
}

/**
 * Reports the active transport plus Android's roaming capability. This exists
 * because expo-network exposes Wi-Fi/cellular but not roaming, which Auto
 * Download needs as an independent toggle.
 */
class NetworkConditionsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val connectivity =
    reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private var callback: ConnectivityManager.NetworkCallback? = null
  private var listenerCount = 0

  override fun getName() = "CircleNetworkConditions"

  private fun status(): WritableMap {
    val active = connectivity.activeNetwork
    val capabilities = active?.let(connectivity::getNetworkCapabilities)
    val type = when {
      active == null -> "NONE"
      capabilities == null -> "UNKNOWN"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "BLUETOOTH"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
      else -> "OTHER"
    }
    val roaming =
      capabilities != null &&
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
        !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING)
    return Arguments.createMap().apply {
      putString("type", type)
      putBoolean("isConnected", active != null)
      putBoolean("isRoaming", roaming)
      putBoolean(
        "isMetered",
        capabilities != null && !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
      )
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(status())
  }

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
    if (callback != null) return
    val networkCallback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) = emit()
      override fun onLost(network: Network) = emit()
      override fun onCapabilitiesChanged(
        network: Network,
        capabilities: NetworkCapabilities,
      ) = emit()
    }
    try {
      connectivity.registerDefaultNetworkCallback(networkCallback)
      callback = networkCallback
    } catch (_: Exception) {
      // Older/unusual devices fall back to expo-network's listener.
      listenerCount = 0
    }
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = (listenerCount - count).coerceAtLeast(0)
    if (listenerCount == 0) stop()
  }

  private fun emit() {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("CircleNetworkChange", Arguments.createMap().apply {
        putMap("status", status())
      })
  }

  private fun stop() {
    val current = callback ?: return
    callback = null
    try {
      connectivity.unregisterNetworkCallback(current)
    } catch (_: Exception) {
      // Already unregistered with the Android process.
    }
  }

  override fun invalidate() {
    stop()
    super.invalidate()
  }
}
