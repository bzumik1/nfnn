package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.content.application.media.UnusedMediaCleanupService;
import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import tools.jackson.databind.JsonNode;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import javax.imageio.ImageIO;

import static org.assertj.core.api.Assertions.assertThat;

public class MediaStepDefinitions {

    private static final String ADMIN_MEDIA = "/api/admin/content/media";
    private static final String PUBLIC_MEDIA = "/api/content/media/";
    private static final String ACCESS_TOKEN = "access_token";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final UploadedImages images;
    private final UnusedMediaCleanupService cleanup;
    private String exchangedApiToken;

    public MediaStepDefinitions(ApiClient api, DonorSessions sessions, UploadedImages images, UnusedMediaCleanupService cleanup) {
        this.api = api;
        this.sessions = sessions;
        this.images = images;
        this.cleanup = cleanup;
    }

    @When("the cleanup of unused photos runs")
    public void theCleanupOfUnusedPhotosRuns() {
        cleanup.deleteUnusedMedia();
    }

    @When("{string} uploads a {int} by {int} pixel PNG image named {string}")
    public void uploadsAPixelPngImageNamed(String alias, int width, int height, String fileName) {
        sessions.actAs(alias);
        api.postFile(ADMIN_MEDIA, "file", fileName, "image/png", png(width, height));
        if (api.lastResponse().getStatusCode().value() == 201) {
            images.remember(fileName, api.lastResponseJson().get("id").asString());
        }
    }

    @When("{string} uploads a text file as an image")
    public void uploadsATextFileAsAnImage(String alias) {
        sessions.actAs(alias);
        api.postFile(ADMIN_MEDIA, "file", "poznamky.txt", "text/plain", "Toto není obrázek.".getBytes(StandardCharsets.UTF_8));
    }

    @When("{string} uploads an {int} MB file as an image")
    public void uploadsAnMbFileAsAnImage(String alias, int megabytes) {
        sessions.actAs(alias);
        api.postFile(ADMIN_MEDIA, "file", "velky.png", "image/png", new byte[megabytes * 1024 * 1024]);
    }

    @When("someone without a token asks for the uploaded image at width {int}")
    public void someoneWithoutATokenAsksForTheUploadedImageAtWidth(int width) {
        api.forgetCredentials();
        api.getBytes(PUBLIC_MEDIA + images.lastId() + "?w=" + width);
    }

    @When("someone without a token asks for the uploaded image without a width")
    public void someoneWithoutATokenAsksForTheUploadedImageWithoutAWidth() {
        api.forgetCredentials();
        api.getBytes(PUBLIC_MEDIA + images.lastId());
    }

    @When("someone without a token asks for the image uploaded as {string}")
    public void someoneWithoutATokenAsksForTheImageUploadedAs(String fileName) {
        api.forgetCredentials();
        api.getBytes(PUBLIC_MEDIA + images.idOf(fileName));
    }

    @When("someone without a token asks for the image {string}")
    public void someoneWithoutATokenAsksForTheImage(String id) {
        api.forgetCredentials();
        api.getBytes(PUBLIC_MEDIA + id);
    }

    @Then("the uploaded image says:")
    public void theUploadedImageSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> assertThat(response.get(path).asString()).as(path).isEqualTo(value));
    }

    @Then("the uploaded image has a public address")
    public void theUploadedImageHasAPublicAddress() {
        assertThat(api.lastResponseJson().get("url").asString()).isEqualTo(PUBLIC_MEDIA + images.lastId());
    }

    @Then("the response is a WebP image {int} pixels wide and {int} high")
    public void theResponseIsAWebpImagePixelsWideAndHigh(int width, int height) {
        assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).isEqualTo("image/webp");
        byte[] bytes = api.lastResponseBytes();
        assertThat(new String(bytes, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("RIFF");
        assertThat(new String(bytes, 8, 4, StandardCharsets.US_ASCII)).isEqualTo("WEBP");
        assertThat(api.lastResponse().getHeaders().getFirst("X-Image-Width")).isEqualTo(String.valueOf(width));
        assertThat(api.lastResponse().getHeaders().getFirst("X-Image-Height")).isEqualTo(String.valueOf(height));
    }

    @Then("the image response is cacheable for a year")
    public void theImageResponseIsCacheableForAYear() {
        assertThat(api.lastResponse().getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).contains("max-age=31536000", "public", "immutable");
    }

    @When("{string} places the focal point of the image uploaded as {string} at {int} % from the left and {int} % from the top")
    public void placesTheFocalPointOfTheImageUploadedAs(String alias, String fileName, int x, int y) {
        sessions.actAs(alias);
        placeFocalPoint(images.idOf(fileName), x, y);
    }

    @When("{string} places the focal point of the image {string} at {int} % from the left and {int} % from the top")
    public void placesTheFocalPointOfTheImage(String alias, String id, int x, int y) {
        sessions.actAs(alias);
        placeFocalPoint(id, x, y);
    }

    @When("{string} removes the focal point of the image uploaded as {string}")
    public void removesTheFocalPointOfTheImageUploadedAs(String alias, String fileName) {
        sessions.actAs(alias);
        removeFocalPoint(images.idOf(fileName));
    }

    @When("{string} sends the focal point of the image uploaded as {string} as {}")
    public void sendsTheFocalPointOfTheImageUploadedAs(String alias, String fileName, String json) {
        sessions.actAs(alias);
        api.send("PUT", ADMIN_MEDIA + "/" + images.idOf(fileName), "application/json", json);
    }

    @When("someone without a token places the focal point of the image uploaded as {string} at {int} % from the left and {int} % from the top")
    public void someoneWithoutATokenPlacesTheFocalPoint(String fileName, int x, int y) {
        api.forgetCredentials();
        placeFocalPoint(images.idOf(fileName), x, y);
    }

    @When("the exchanged API token places the focal point of the image uploaded as {string} at {int} % from the left and {int} % from the top")
    public void theExchangedApiTokenPlacesTheFocalPoint(String fileName, int x, int y) {
        actAsExchangedApiToken();
        placeFocalPoint(images.idOf(fileName), x, y);
    }

    @When("the exchanged API token removes the focal point of the image uploaded as {string}")
    public void theExchangedApiTokenRemovesTheFocalPoint(String fileName) {
        actAsExchangedApiToken();
        removeFocalPoint(images.idOf(fileName));
    }

    @Then("the photo says:")
    public void thePhotoSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> {
            JsonNode node = response;
            for (String segment : path.split("\\.")) {
                node = node == null || node.isNull() ? null : node.get(segment);
            }
            String actual = node == null || node.isNull() ? "" : node.asString();
            assertThat(actual).as(path).isEqualTo(images.resolve(value == null ? "" : value));
        });
    }

    private void placeFocalPoint(String id, int x, int y) {
        api.put(ADMIN_MEDIA + "/" + id, Map.of("focalPoint", Map.of("x", x, "y", y)));
    }

    private void removeFocalPoint(String id) {
        Map<String, Object> body = new HashMap<>();
        body.put("focalPoint", null);
        api.put(ADMIN_MEDIA + "/" + id, body);
    }

    private void actAsExchangedApiToken() {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has(ACCESS_TOKEN)) {
            exchangedApiToken = last.get(ACCESS_TOKEN).asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
    }

    private static byte[] png(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(new Color(0x6a, 0x8f, 0x3c));
        graphics.fillRect(0, 0, width, height);
        graphics.setColor(Color.WHITE);
        graphics.fillOval(width / 4, height / 4, width / 2, height / 2);
        graphics.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "png", out);
        } catch (IOException impossible) {
            throw new UncheckedIOException(impossible);
        }
        return out.toByteArray();
    }
}
