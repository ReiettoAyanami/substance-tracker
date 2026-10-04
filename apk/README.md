# apk/

Where the CI puts the Android app's APK (`substance.apk`) before building the image, which copies
this folder and serves the file at `/download/substance.apk` (design-android.md, "/download"). The
APK is never committed (`.gitignore`); an image built without the CI has none.
