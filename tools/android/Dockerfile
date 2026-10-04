# The Android SDK container (design-android.md, "Dev tooling"): Java 21, Google's command-line
# tools, and on first use the SDK itself (in the android-sdk volume, see android.sh). It builds
# the dev app's APK from web/android and installs it with adb, on a phone over Wi-Fi pairing or on
# an emulator (needs /dev/kvm). Started on request only:
#   docker compose -f compose.dev.yaml --profile android up -d android
FROM eclipse-temurin:21-jdk-noble

ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:/opt/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/emulator

# socat: the live reload's way from the phone to ng serve (android.sh live). The rest: the
# emulator's own libraries (it runs headless, -no-window).
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip curl socat libpulse0 libnss3 libxcomposite1 libxcursor1 \
      libxdamage1 libxi6 libxtst6 libxrandr2 libgl1 libasound2t64 libdbus-1-3 \
 && rm -rf /var/lib/apt/lists/*

# Google's command-line tools (sdkmanager, avdmanager), pinned.
ARG CMDLINE_TOOLS=16111833
RUN mkdir -p /opt/cmdline-tools \
 && curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip" -o /tmp/tools.zip \
 && unzip -q /tmp/tools.zip -d /opt/cmdline-tools \
 && mv /opt/cmdline-tools/cmdline-tools /opt/cmdline-tools/latest \
 && rm /tmp/tools.zip

COPY android.sh /usr/local/bin/android.sh
# Whatever the checkout did to its line endings (CR LF on Windows), the script runs.
RUN tr -d '\015' < /usr/local/bin/android.sh > /tmp/android.sh \
 && mv /tmp/android.sh /usr/local/bin/android.sh \
 && chmod +x /usr/local/bin/android.sh

WORKDIR /app/android
CMD ["sleep", "infinity"]
