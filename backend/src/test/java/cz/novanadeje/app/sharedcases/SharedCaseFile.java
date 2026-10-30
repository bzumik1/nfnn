package cz.novanadeje.app.sharedcases;

import java.util.List;

public record SharedCaseFile(String source, String logic, List<SharedCase> cases) {
}
