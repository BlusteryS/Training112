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
    implementation("io.vertx:vertx-pg-client")
    implementation("com.password4j:password4j:1.8.4")
    implementation("org.flywaydb:flyway-core:13.6.0")
    implementation("org.flywaydb:flyway-database-postgresql:13.6.0")
    implementation("org.postgresql:postgresql:42.7.13")
    runtimeOnly("org.slf4j:slf4j-simple:2.0.17")


}

application {
    mainClass = "com.training112.Main"
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release = 25
}
