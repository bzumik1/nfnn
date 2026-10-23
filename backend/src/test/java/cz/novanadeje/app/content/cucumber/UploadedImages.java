package cz.novanadeje.app.content.cucumber;

import io.cucumber.spring.ScenarioScope;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
@ScenarioScope
public class UploadedImages {

    private static final String PLACEHOLDER = "{uploaded}";

    private final Map<String, String> idsByFileName = new LinkedHashMap<>();
    private String lastId;

    public void remember(String fileName, String id) {
        lastId = id;
        idsByFileName.put(fileName, id);
    }

    public String lastId() {
        if (lastId == null) {
            throw new IllegalStateException("No image was uploaded in this scenario");
        }
        return lastId;
    }

    public String idOf(String fileName) {
        String id = idsByFileName.get(fileName);
        if (id == null) {
            throw new IllegalArgumentException("No image \"" + fileName + "\" was uploaded in this scenario; known: " + idsByFileName.keySet());
        }
        return id;
    }

    public String resolve(String value) {
        return lastId == null || value == null ? value : value.replace(PLACEHOLDER, lastId);
    }
}
