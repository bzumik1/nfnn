package cz.novanadeje.app.cucumber;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.ExcludeTags;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

import static io.cucumber.junit.platform.engine.Constants.GLUE_PROPERTY_NAME;
import static io.cucumber.junit.platform.engine.Constants.PLUGIN_PROPERTY_NAME;

@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
@ExcludeTags("donors")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME, value = "cz.novanadeje.app")
@ConfigurationParameter(key = PLUGIN_PROPERTY_NAME, value = "pretty, summary")
@ConfigurationParameter(key = "junit.platform.suite.fail-if-no-tests", value = "false")
public class OtherContextsAcceptanceTests {
}
