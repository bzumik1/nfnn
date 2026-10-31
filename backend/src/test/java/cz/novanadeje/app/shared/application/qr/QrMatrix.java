package cz.novanadeje.app.shared.application.qr;

public record QrMatrix(int size, String modules) {

    private static final int SMALLEST_SIZE = 21;
    private static final int LARGEST_SIZE = 177;
    private static final int SIZE_STEP = 4;

    public QrMatrix {
        if (size < SMALLEST_SIZE || size > LARGEST_SIZE || (size - SMALLEST_SIZE) % SIZE_STEP != 0) {
            throw new IllegalArgumentException("A QR code is 21 to 177 modules wide in steps of 4: " + size);
        }
        if (modules == null || modules.length() != size * size || !modules.chars().allMatch(module -> module == '0' || module == '1')) {
            throw new IllegalArgumentException("A QR code of size " + size + " needs " + size * size + " modules of 0 or 1");
        }
    }

    public boolean isDark(int column, int row) {
        return modules.charAt(row * size + column) == '1';
    }
}
