package cz.novanadeje.app.shared.application.qr;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class QrMatrixTest {

    private static final int SMALLEST = 21;

    @Test
    @DisplayName("Given row-major modules, when the matrix is read, then it tells dark modules by column and row")
    void should_tell_dark_modules_by_column_and_row_when_read_given_row_major_modules() {
        String modules = "1" + "0".repeat(SMALLEST - 1) + "01" + "0".repeat(SMALLEST * SMALLEST - SMALLEST - 2);

        QrMatrix matrix = new QrMatrix(SMALLEST, modules);

        assertThat(matrix.isDark(0, 0)).isTrue();
        assertThat(matrix.isDark(1, 0)).isFalse();
        assertThat(matrix.isDark(1, 1)).isTrue();
        assertThat(matrix.isDark(0, 1)).isFalse();
    }

    @Test
    @DisplayName("Given a size no QR version has, when the matrix is created, then it is rejected")
    void should_reject_when_created_given_a_size_no_qr_version_has() {
        assertThatIllegalArgumentException().isThrownBy(() -> new QrMatrix(22, "0".repeat(22 * 22)));
        assertThatIllegalArgumentException().isThrownBy(() -> new QrMatrix(17, "0".repeat(17 * 17)));
        assertThatIllegalArgumentException().isThrownBy(() -> new QrMatrix(181, "0".repeat(181 * 181)));
    }

    @Test
    @DisplayName("Given modules that do not fill the square, when the matrix is created, then it is rejected")
    void should_reject_when_created_given_modules_that_do_not_fill_the_square() {
        assertThatIllegalArgumentException().isThrownBy(() -> new QrMatrix(SMALLEST, "0".repeat(SMALLEST * SMALLEST - 1)));
    }

    @Test
    @DisplayName("Given modules other than zeros and ones, when the matrix is created, then it is rejected")
    void should_reject_when_created_given_modules_other_than_zeros_and_ones() {
        assertThatIllegalArgumentException().isThrownBy(() -> new QrMatrix(SMALLEST, "2" + "0".repeat(SMALLEST * SMALLEST - 1)));
    }
}
