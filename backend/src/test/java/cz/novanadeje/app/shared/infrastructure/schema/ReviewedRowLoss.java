package cz.novanadeje.app.shared.infrastructure.schema;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

record ReviewedRowLoss(String table, String changesetId, Change change, String reason) {

    enum Change {
        DROPPED,
        EMPTIED
    }

    ReviewedRowLoss {
        if (table == null || table.isBlank() || changesetId == null || !changesetId.matches("[a-z]+/[0-9]{3}-[a-z0-9-]+") || change == null
                || reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("A reviewed row loss names its table, the changeset that loses the rows as <context>/<id>, how and why");
        }
    }

    static List<String> violations(List<ReviewedRowLoss> reviewed, Map<String, Long> before, Map<String, Long> after,
                                   List<String> changesetsApplied) {
        List<String> violations = new ArrayList<>();
        for (ReviewedRowLoss loss : reviewed) {
            violations.addAll(loss.violations(before, after, changesetsApplied));
        }
        before.forEach((table, rows) -> {
            if (reviewed.stream().noneMatch(loss -> loss.table().equals(table))) {
                Long kept = after.get(table);
                if (kept == null) {
                    violations.add(table + " is gone, and no reviewed row loss names it");
                } else if (kept < rows) {
                    violations.add(table + " kept " + kept + " of its " + rows + " rows, and no reviewed row loss names it");
                }
            }
        });
        return violations;
    }

    private List<String> violations(Map<String, Long> before, Map<String, Long> after, List<String> changesetsApplied) {
        List<String> violations = new ArrayList<>();
        Long rows = before.get(table);
        if (rows == null || rows == 0) {
            violations.add(table + " has no rows in the baseline, so the reviewed row loss of " + changesetId + " proves nothing");
        }
        if (!changesetsApplied.contains(changesetId)) {
            violations.add("the changeset " + changesetId + " that loses the rows of " + table + " did not run");
        } else {
            String context = changesetId.substring(0, changesetId.indexOf('/') + 1);
            changesetsApplied.subList(changesetsApplied.indexOf(changesetId) + 1, changesetsApplied.size()).stream()
                    .filter(later -> later.startsWith(context))
                    .forEach(later ->
                    violations.add(later + " ran after " + changesetId + ", which lost the rows of " + table + ": move the baseline past "
                            + changesetId + " with rows of its own and retire the reviewed row loss"));
        }
        Long kept = after.get(table);
        switch (change) {
            case DROPPED -> {
                if (kept != null) {
                    violations.add(table + " was reviewed as dropped by " + changesetId + ", but it is still there with " + kept + " rows");
                }
            }
            case EMPTIED -> {
                if (kept == null) {
                    violations.add(table + " was reviewed as emptied by " + changesetId + ", but it is gone");
                } else if (kept != 0) {
                    violations.add(table + " was reviewed as emptied by " + changesetId + ", but it still has " + kept + " rows");
                }
            }
        }
        return violations;
    }
}
