package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.shared.application.people.PrintPortrait;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

class PrintPortraitsTest {

    private static final Color RED = new Color(200, 30, 30);
    private static final Color BLUE = new Color(30, 30, 200);

    @Test
    @DisplayName("Given a landscape portrait with a band in its middle third, when prepared for print, then it is a 600 px square JPEG cut from the centre")
    void should_cut_square_from_centre_when_prepared_given_landscape_portrait() throws IOException {
        PrintPortrait portrait = PrintPortraits.prepare(variantOf(bandedImage(900, 600)));

        BufferedImage printed = ImageIO.read(new ByteArrayInputStream(portrait.jpeg()));
        assertThat(portrait.side()).isEqualTo(600);
        assertThat(printed.getWidth()).isEqualTo(600);
        assertThat(printed.getHeight()).isEqualTo(600);
        assertThat(isClose(new Color(printed.getRGB(20, 300)), RED)).as("left edge").isTrue();
        assertThat(isClose(new Color(printed.getRGB(300, 300)), BLUE)).as("centre").isTrue();
        assertThat(isClose(new Color(printed.getRGB(580, 300)), RED)).as("right edge").isTrue();
        assertThat(isClose(new Color(printed.getRGB(140, 300)), RED)).as("the band starts a quarter in").isTrue();
        assertThat(isClose(new Color(printed.getRGB(160, 300)), BLUE)).as("the band starts a quarter in").isTrue();
    }

    @Test
    @DisplayName("Given a portrait taller than wide, when prepared for print, then the square is cut from its vertical centre")
    void should_cut_square_from_vertical_centre_when_prepared_given_portrait_format() throws IOException {
        BufferedImage tall = new BufferedImage(400, 800, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = tall.createGraphics();
        graphics.setColor(RED);
        graphics.fillRect(0, 0, 400, 800);
        graphics.setColor(BLUE);
        graphics.fillRect(0, 200, 400, 400);
        graphics.dispose();

        BufferedImage printed = ImageIO.read(new ByteArrayInputStream(PrintPortraits.prepare(variantOf(tall)).jpeg()));

        assertThat(printed.getWidth()).isEqualTo(600);
        assertThat(printed.getHeight()).isEqualTo(600);
        assertThat(isClose(new Color(printed.getRGB(300, 10)), BLUE)).isTrue();
        assertThat(isClose(new Color(printed.getRGB(300, 590)), BLUE)).isTrue();
    }

    @Test
    @DisplayName("Given the same portrait twice, when prepared for print, then both give the same bytes")
    void should_give_same_bytes_when_prepared_twice_given_same_portrait() throws IOException {
        MediaVariant variant = variantOf(bandedImage(900, 600));

        assertThat(PrintPortraits.prepare(variant).jpeg()).isEqualTo(PrintPortraits.prepare(variant).jpeg());
    }

    @Test
    @DisplayName("Given a portrait smaller than the print size, when prepared for print, then it is enlarged to the 600 px square")
    void should_enlarge_when_prepared_given_small_portrait() throws IOException {
        BufferedImage printed = ImageIO.read(new ByteArrayInputStream(PrintPortraits.prepare(variantOf(bandedImage(240, 160))).jpeg()));

        assertThat(printed.getWidth()).isEqualTo(600);
        assertThat(printed.getHeight()).isEqualTo(600);
    }

    private static BufferedImage bandedImage(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(RED);
        graphics.fillRect(0, 0, width, height);
        graphics.setColor(BLUE);
        graphics.fillRect(width / 3, 0, width / 3, height);
        graphics.dispose();
        return image;
    }

    private static MediaVariant variantOf(BufferedImage image) throws IOException {
        ByteArrayOutputStream webp = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, "webp", webp)).isTrue();
        return new MediaVariant(image.getWidth(), image.getHeight(), webp.toByteArray());
    }

    private static boolean isClose(Color actual, Color expected) {
        return Math.abs(actual.getRed() - expected.getRed()) < 40 && Math.abs(actual.getGreen() - expected.getGreen()) < 40
                && Math.abs(actual.getBlue() - expected.getBlue()) < 40;
    }
}
