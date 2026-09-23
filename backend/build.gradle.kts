import org.gradle.jvm.application.tasks.CreateStartScripts

plugins {
    application
}

repositories {
    mavenCentral()
}

java {
    sourceCompatibility = JavaVersion.VERSION_25
    targetCompatibility = JavaVersion.VERSION_25
}

dependencies {
    implementation(platform("io.vertx:vertx-stack-depchain:5.1.8"))
    implementation("io.vertx:vertx-web")
    implementation("io.vertx:vertx-json-schema")
    implementation("org.zeromq:jeromq:0.6.0")
    implementation("io.vertx:vertx-pg-client")
    implementation("com.password4j:password4j:1.8.4")
    implementation("org.flywaydb:flyway-core:13.6.0")
    implementation("org.flywaydb:flyway-database-postgresql:13.6.0")
    implementation("org.postgresql:postgresql:42.7.13")
    runtimeOnly("org.slf4j:slf4j-simple:2.0.17")
}
tasks.processResources {
    from("../speech/src/speech112/contracts") { include("*.json"); into("contracts") }
}

application {
    mainClass = "com.training112.Main"
    applicationDefaultJvmArgs = listOf("-Xms64m", "-Xmx384m", "-XX:+ExitOnOutOfMemoryError")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release = 25
}

val createAdminScripts = tasks.register<CreateStartScripts>("createAdminScripts") {
    applicationName = "create-admin"
    mainClass = "com.training112.cli.CreateAdmin"
    outputDir = layout.buildDirectory.dir("admin-scripts").get().asFile
    classpath = files(tasks.jar, configurations.runtimeClasspath)
    defaultJvmOpts = listOf("-Xmx128m", "-XX:+ExitOnOutOfMemoryError")
}

distributions {
    main {
        contents {
            from(createAdminScripts) {
                into("bin")
                filePermissions { unix("755") }
            }
        }
    }
}
