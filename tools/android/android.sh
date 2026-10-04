#!/bin/sh
# Helpers of the Android SDK container (tools/android/Dockerfile). From the project root:
#   docker compose -f compose.dev.yaml exec android android.sh <command>
#
#   setup              the SDK in its volume: licenses, platform tools, platform and build tools
#   build              the dev app's debug APK (after `npx cap sync android` in the web container)
#   pair <ip:port> <code>   pair a phone over Wi-Fi (Developer options > Wireless debugging)
#   connect <ip:port>  connect to the paired phone (the port shown on the Wireless debugging screen)
#   install            install the dev app's APK on the connected phone or emulator
#   live               the phone's localhost:4200 reaches the web service's ng serve (live reload)
#   start / stop       open or close the dev app on the phone or emulator
#   emulator           start a headless emulator (first time: downloads its system image)
set -eu

SDK_PACKAGES="platform-tools platforms;android-36 build-tools;36.0.0"
APK=/app/android/app/build/outputs/apk/dev/debug/app-dev-debug.apk
AVD=substance
PACKAGE=io.github.reiettoayanami.substancetracker.dev

case "${1:-}" in
  setup)
    yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null
    # shellcheck disable=SC2086
    sdkmanager --sdk_root="$ANDROID_HOME" $SDK_PACKAGES
    ;;
  build)
    # sh: from a Windows checkout the wrapper may lose its executable bit
    sh ./gradlew --no-daemon assembleDevDebug
    echo "$APK"
    ;;
  pair)
    adb pair "$2" "$3"
    ;;
  connect)
    adb connect "$2"
    adb devices -l
    adb shell getprop ro.build.version.release
    ;;
  install)
    adb install -r "$APK"
    ;;
  live)
    # The dev app loads http://localhost:4200 (CAP_LIVE_RELOAD at `cap sync`): adb carries the phone's
    # port 4200 to this container, socat on to ng serve, which accepts the host name localhost.
    pgrep -f "socat TCP-LISTEN:4200" >/dev/null || (nohup socat TCP-LISTEN:4200,fork,reuseaddr TCP:web:4200 >/tmp/socat.log 2>&1 &)
    adb reverse tcp:4200 tcp:4200
    ;;
  start)
    adb shell am start -n "$PACKAGE/io.github.reiettoayanami.substancetracker.MainActivity"
    ;;
  stop)
    adb shell am force-stop "$PACKAGE"
    ;;
  emulator)
    image="system-images;android-36;google_apis;x86_64"
    sdkmanager --sdk_root="$ANDROID_HOME" emulator "$image"
    if [ ! -d "$HOME/.android/avd/$AVD.avd" ]; then
      echo no | avdmanager create avd -n "$AVD" -k "$image" -d pixel_6
      # avdmanager takes the SDK root from where the command-line tools are (/opt), not ANDROID_HOME.
      sed -i 's|^image.sysdir.1=.*|image.sysdir.1=system-images/android-36/google_apis/x86_64/|' "$HOME/.android/avd/$AVD.avd/config.ini"
    fi
    nohup emulator -avd "$AVD" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot >/tmp/emulator.log 2>&1 &
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
    echo "emulator ready"
    ;;
  *)
    sed -n '2,14p' "$0"
    exit 1
    ;;
esac
