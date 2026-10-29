package cz.novanadeje.app.operations.domain.backup;

import java.util.List;
import java.util.TreeSet;
import java.util.random.RandomGenerator;

public record BackupKeyWordPositions(List<Integer> positions) {

    public static final int ASKED = 3;

    public BackupKeyWordPositions {
        if (positions == null || positions.size() != ASKED || positions.stream().distinct().count() != ASKED
                || positions.stream().anyMatch(position -> position == null || position < 1 || position > BackupKeyWords.COUNT)) {
            throw new BackupKeyCheckMismatch();
        }
        positions = positions.stream().sorted().toList();
    }

    public static BackupKeyWordPositions draw(RandomGenerator random) {
        TreeSet<Integer> drawn = new TreeSet<>();
        while (drawn.size() < ASKED) {
            drawn.add(1 + random.nextInt(BackupKeyWords.COUNT));
        }
        return new BackupKeyWordPositions(List.copyOf(drawn));
    }

    public static BackupKeyWordPositions of(List<BackupKeyWordCheck> checks) {
        return new BackupKeyWordPositions(checks.stream().map(BackupKeyWordCheck::position).toList());
    }
}
