plugins {
    id("com.android.application") version "8.13.2" apply false
    kotlin("android") version "2.3.21" apply false
    kotlin("jvm") version "2.3.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.21" apply false
}
allprojects {
    // Java 17/Windows test-worker argument files can misdecode a Unicode classpath.
    // Keep source in the requested workspace and place only build outputs in ASCII.
    val sourcePath = rootDir.absolutePath
    if (System.getProperty("os.name").startsWith("Windows") && sourcePath.any { it.code > 127 }) {
        val cache = java.io.File(System.getenv("LOCALAPPDATA"), "XindongG1Build/${sourcePath.hashCode().toUInt().toString(16)}/$name")
        layout.buildDirectory.set(cache)
    }
    dependencyLocking { lockAllConfigurations() }
}
tasks.register("stageVerification") {
    dependsOn(":probe-core:test", ":app:testDebugUnitTest", ":app:lintDebug", ":app:assembleDebug")
    doLast {
        copy {
            from(project(":app").layout.buildDirectory.file("outputs/apk/debug/app-debug.apk"))
            into(layout.projectDirectory.dir("deliverables"))
            rename { "xindong-g1-probe-debug.apk" }
        }
        copy {
            from(project(":probe-core").layout.buildDirectory.dir("test-results/test"))
            include("*.xml")
            into(layout.projectDirectory.dir("reports/tests/kotlin"))
        }
        copy {
            from(project(":app").layout.buildDirectory.dir("reports"))
            include("lint-results-debug.*")
            into(layout.projectDirectory.dir("reports/tests/lint"))
        }
    }
}
tasks.register("productVerification") {
    dependsOn(":product-core:test", ":product-app:testDebugUnitTest", ":qa-runner:classes", ":product-app:lintDebug", ":product-app:assembleDebug")
    doLast {
        copy { from(project(":product-app").layout.buildDirectory.file("outputs/apk/debug/product-app-debug.apk")); into(layout.projectDirectory.dir("deliverables")); rename { "xindong-junshi-debug.apk" } }
        copy { from(project(":product-core").layout.buildDirectory.dir("test-results/test")); include("*.xml"); into(layout.projectDirectory.dir("reports/product/kotlin")) }
        copy { from(project(":product-app").layout.buildDirectory.dir("test-results/testDebugUnitTest")); include("*.xml"); into(layout.projectDirectory.dir("reports/product/android-unit")) }
        copy { from(project(":product-app").layout.buildDirectory.dir("reports")); include("lint-results-debug.*"); into(layout.projectDirectory.dir("reports/product/lint")) }
    }
}
