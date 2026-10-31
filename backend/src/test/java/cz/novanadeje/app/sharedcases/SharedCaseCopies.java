package cz.novanadeje.app.sharedcases;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

final class SharedCaseCopies {

    static final List<String> QR_CASE_FILES = List.of("qr/encoder.json", "qr/payment.json", "qr/totp.json");
    static final int SMALLEST_TELLING_VALUE = 2;
    private static final Pattern MATRIX_NOISE = Pattern.compile("[\\s\"'`,+\\[\\]]");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Map<JsonNode, String> caseFiles;
    private final Map<String, String> caseFileTexts;
    private final Map<JsonNode, String> expectedValues;
    private final Set<String> matrices;

    private SharedCaseCopies(Map<JsonNode, String> caseFiles, Map<String, String> caseFileTexts, Map<JsonNode, String> expectedValues, Set<String> matrices) {
        this.caseFiles = caseFiles;
        this.caseFileTexts = caseFileTexts;
        this.expectedValues = expectedValues;
        this.matrices = matrices;
    }

    static SharedCaseCopies ofRepository() {
        Map<JsonNode, String> caseFiles = new LinkedHashMap<>();
        Map<String, String> caseFileTexts = new LinkedHashMap<>();
        Map<JsonNode, String> expectedValues = new LinkedHashMap<>();
        for (String caseFile : SharedCases.caseFiles()) {
            caseFiles.put(SharedCases.tree(caseFile), caseFile);
            caseFileTexts.put(caseFile, SharedCases.text(caseFile).strip());
            for (SharedCase sharedCase : SharedCases.read(caseFile).cases()) {
                if (sharedCase.expected().isContainer() && sharedCase.expected().size() >= SMALLEST_TELLING_VALUE) {
                    expectedValues.putIfAbsent(sharedCase.expected(), "the expected value of \"" + sharedCase.name() + "\" from " + SharedCases.FOLDER + "/" + caseFile);
                }
            }
        }
        Set<String> matrices = new TreeSet<>();
        QR_CASE_FILES.forEach(caseFile -> SharedCases.read(caseFile).cases().stream()
                .filter(sharedCase -> sharedCase.expected().has("matrix"))
                .forEach(sharedCase -> matrices.add(sharedCase.expected().get("matrix").valueStream().map(JsonNode::asString).collect(Collectors.joining()))));
        if (matrices.isEmpty()) {
            throw new IllegalStateException("The QR case files hold no matrix");
        }
        return new SharedCaseCopies(caseFiles, caseFileTexts, expectedValues, matrices);
    }

    List<String> in(String relativePath, String text) {
        Set<String> found = new TreeSet<>();
        parsed(text).ifPresent(tree -> copiesIn(tree, found));
        caseFileTexts.forEach((caseFile, content) -> {
            if (text.strip().equals(content)) {
                found.add("a copy of " + SharedCases.FOLDER + "/" + caseFile);
            }
        });
        if (found.isEmpty() && matrices.stream().anyMatch(MATRIX_NOISE.matcher(text).replaceAll("")::contains)) {
            found.add("the matrix of a QR case from " + SharedCases.FOLDER + "/qr");
        }
        List<String> copies = new ArrayList<>();
        found.forEach(copy -> copies.add(relativePath + " holds " + copy));
        return copies;
    }

    private void copiesIn(JsonNode node, Set<String> found) {
        if (caseFiles.containsKey(node)) {
            found.add("a copy of " + SharedCases.FOLDER + "/" + caseFiles.get(node));
            return;
        }
        if (expectedValues.containsKey(node)) {
            found.add(expectedValues.get(node));
            return;
        }
        node.values().forEach(child -> copiesIn(child, found));
    }

    private static Optional<JsonNode> parsed(String text) {
        String stripped = text.strip();
        if (!stripped.startsWith("{") && !stripped.startsWith("[")) {
            return Optional.empty();
        }
        try {
            return Optional.of(JSON.readTree(stripped));
        } catch (JacksonException notJson) {
            return Optional.empty();
        }
    }
}
