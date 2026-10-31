package cz.novanadeje.app.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ServerDrawingLibrariesTest {

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "com.openhtmltopdf.pdfboxout.PdfRendererBuilder",
            "io.github.openhtmltopdf.pdfboxout.PdfRendererBuilder",
            "org.apache.pdfbox.pdmodel.PDDocument",
            "org.apache.pdfbox.Loader",
            "com.google.zxing.qrcode.QRCodeWriter",
            "com.google.zxing.qrcode.encoder.Encoder"
    })
    @DisplayName("Given the test classpath, when a class of a PDF or QR library is looked up, then it is not there, so neither the application nor a test can draw a receipt or a QR code on the server")
    void should_be_absent_when_looked_up_given_the_test_classpath(String className) {
        assertThatThrownBy(() -> Class.forName(className, false, getClass().getClassLoader()))
                .isInstanceOf(ClassNotFoundException.class);
    }
}
