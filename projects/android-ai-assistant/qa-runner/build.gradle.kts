plugins { kotlin("jvm") }
kotlin { jvmToolchain(17) }
dependencies { implementation(project(":product-core")); implementation("org.json:json:20250517") }
tasks.register<JavaExec>("runQuality") {
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("cn.xindong.core.QaCliKt")
    jvmArgs("-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8", "-Dsun.stderr.encoding=UTF-8")
    // Avoid Windows cmd.exe interpreting the argument separator in gradlew.bat.
    System.getenv("XINDONG_QA_ARGS")?.let { raw -> args(raw.split("|").filter { it.isNotBlank() }) }
}

tasks.register<JavaExec>("runSamples") {
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("cn.xindong.core.SampleCli")
    jvmArgs("-Dfile.encoding=UTF-8", "-Dsun.stdout.encoding=UTF-8", "-Dsun.stderr.encoding=UTF-8")
    System.getenv("XINDONG_SAMPLE_ARGS")?.let { raw -> args(raw.split("|").filter { it.isNotBlank() }) }
}
