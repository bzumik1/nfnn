allprojects {
    tasks.register("downloadDependencies") {
        val classpaths = listOf("compileClasspath", "annotationProcessor", "productionRuntimeClasspath")
            .mapNotNull { configurations.findByName(it) }
        doLast {
            classpaths.forEach { it.resolve() }
        }
    }
}
