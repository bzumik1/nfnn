package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.application.receipt.ReceiptSignatureService;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import org.springframework.jdbc.core.simple.JdbcClient;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminReceiptSignatureStepDefinitions {

    private static final String SIGNATURES = "/api/admin/donations/receipt-signatures/";
    private static final String UNKNOWN_PERSON = "0199f3e0-0000-7000-8000-000000000000";
    private static final String PNG_DATA_URI = "data:image/png;base64,";
    private static final String SVG_TYPE = "image/svg+xml";
    private static final String VECTOR_SIGNATURE = """
            <?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="300" height="100">
              <g fill="#1D2A5C" fill-opacity="0.9">
                <path d="M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80 Z"/>
                <path fill-opacity="0.133" d="M190,60 l20-30 h30 v20 q10 10 20 0 t20 0 z"/>
              </g>
              <path fill="#c0392b" d="m 250 50 L 290 90 Z"/>
            </svg>
            """;
    private static final Map<String, String> REFUSED_VECTORS = Map.of(
            "a script", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><script>alert(1)</script><path d=\"M0 0 L1 1\"/></svg>",
            "an external entity", "<?xml version=\"1.0\"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM \"file:///etc/hostname\">]>"
                    + "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path d=\"&xxe;\"/></svg>",
            "a link", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path href=\"https://example.com/\" d=\"M0 0 L1 1\"/></svg>",
            "a style", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path style=\"fill:url(https://example.com/)\" d=\"M0 0 L1 1\"/></svg>",
            "a filter", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><filter id=\"blur\"/><path d=\"M0 0 L1 1\"/></svg>",
            "more than 200 kB", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path d=\"M0 0" + " ".repeat(205_000) + "L1 1\"/></svg>",
            "path data that grows past 256 kB once absolute", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path d=\"M0 0"
                    + " c1 1 1 1 1 1".repeat(14_000) + "\"/></svg>",
            "an element of another namespace", "<svg xmlns=\"urn:example:other\" viewBox=\"0 0 10 10\"><path d=\"M0 0 L1 1\"/></svg>",
            "malformed path data", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path d=\"M0 0 L1\"/></svg>");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final JdbcClient jdbc;
    private final ScenarioDonors donors;
    private final ReceiptSignatureService signatures;

    public AdminReceiptSignatureStepDefinitions(ApiClient api, DonorSessions sessions, JdbcClient jdbc, ScenarioDonors donors,
            ReceiptSignatureService signatures) {
        this.api = api;
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.donors = donors;
        this.signatures = signatures;
    }

    @Given("{string} has uploaded a {int} by {int} pixel JPEG scan as the receipt signature of the person who signs the receipts")
    @When("{string} stores a {int} by {int} pixel JPEG scan as the receipt signature of the person who signs the receipts")
    public void hasUploadedAJpegScanForTheSignatory(String alias, int width, int height) {
        sessions.actAs(alias);
        UUID signatory = jdbc.sql("select person_id from donation_receipt_signatory").query(UUID.class).single();
        signatures.upload(donors.idOf(alias), new PersonReference(signatory), jpeg(width, height));
    }

    @When("{string} asks for the receipt signature")
    public void asksForTheReceiptSignature(String alias) {
        sessions.actAs(alias);
        api.get(signature());
    }

    @When("someone without a token asks for the receipt signature")
    public void someoneWithoutATokenAsksForTheReceiptSignature() {
        api.forgetCredentials();
        api.get(signature());
    }

    @When("{string} uploads a {int} by {int} pixel JPEG scan named {string} as the receipt signature")
    public void uploadsAJpegScanAsTheReceiptSignature(String alias, int width, int height, String fileName) {
        sessions.actAs(alias);
        api.postFile(signature(), "file", fileName, "image/jpeg", jpeg(width, height));
    }

    @When("{string} uploads the vector signature {string} as the receipt signature")
    public void uploadsTheVectorSignature(String alias, String fileName) {
        sessions.actAs(alias);
        api.postFile(signature(), "file", fileName, SVG_TYPE, VECTOR_SIGNATURE.getBytes(StandardCharsets.UTF_8));
    }

    @When("someone without a token uploads the vector signature {string} as the receipt signature")
    public void someoneWithoutATokenUploadsTheVectorSignature(String fileName) {
        api.forgetCredentials();
        api.postFile(signature(), "file", fileName, SVG_TYPE, VECTOR_SIGNATURE.getBytes(StandardCharsets.UTF_8));
    }

    @When("{string} uploads an SVG signature with {}")
    public void uploadsAnSvgSignatureWith(String alias, String construct) {
        sessions.actAs(alias);
        String svg = REFUSED_VECTORS.get(construct);
        assertThat(svg).as("an SVG with %s", construct).isNotNull();
        api.postFile(signature(), "file", "podpis.svg", SVG_TYPE, svg.getBytes(StandardCharsets.UTF_8));
    }

    @When("{string} uploads a text file as the receipt signature")
    public void uploadsATextFileAsTheReceiptSignature(String alias) {
        sessions.actAs(alias);
        api.postFile(signature(), "file", "podpis.txt", "text/plain", "Josef Dvořáček".getBytes(StandardCharsets.UTF_8));
    }

    @When("{string} removes the receipt signature")
    public void removesTheReceiptSignature(String alias) {
        sessions.actAs(alias);
        api.delete(signature());
    }

    @When("{string} uploads a {int} by {int} pixel JPEG scan as the receipt signature of {string}")
    public void uploadsAJpegScanAsTheReceiptSignatureOf(String alias, int width, int height, String person) {
        sessions.actAs(alias);
        api.postFile(SIGNATURES + personIdOf(person), "file", "podpis.jpg", "image/jpeg", jpeg(width, height));
    }

    @When("{string} asks for the receipt signature of {string}")
    public void asksForTheReceiptSignatureOf(String alias, String person) {
        sessions.actAs(alias);
        api.get(SIGNATURES + personIdOf(person));
    }

    @When("{string} uploads a {int} by {int} pixel JPEG scan as the receipt signature of a person who does not exist")
    public void uploadsAJpegScanForAPersonWhoDoesNotExist(String alias, int width, int height) {
        sessions.actAs(alias);
        api.postFile(SIGNATURES + UNKNOWN_PERSON, "file", "podpis.jpg", "image/jpeg", jpeg(width, height));
    }

    @Then("the receipt signature is not set")
    public void theReceiptSignatureIsNotSet() {
        JsonNode response = api.lastResponseJson();
        assertThat(response.get("configured").asBoolean()).isFalse();
        assertThat(response.get("kind").isNull()).isTrue();
        assertThat(response.get("vector").isNull()).isTrue();
        assertThat(response.get("image").isNull()).isTrue();
        assertThat(response.get("uploadedAt").isNull()).isTrue();
    }

    @Then("the receipt signature is set, {int} by {int} pixels, uploaded at {string}")
    public void theReceiptSignatureIsSet(int width, int height, String uploadedAt) throws IOException {
        JsonNode response = api.lastResponseJson();
        assertThat(response.get("configured").asBoolean()).isTrue();
        assertThat(response.get("kind").asString()).isEqualTo("RASTER");
        assertThat(response.get("vector").isNull()).isTrue();
        assertThat(response.get("width").asInt()).isEqualTo(width);
        assertThat(response.get("height").asInt()).isEqualTo(height);
        assertThat(response.get("uploadedAt").asString()).isEqualTo(uploadedAt);
        String image = response.get("image").asString();
        assertThat(image).startsWith(PNG_DATA_URI);
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(image.substring(PNG_DATA_URI.length()))));
        assertThat(decoded.getWidth()).isEqualTo(width);
        assertThat(decoded.getHeight()).isEqualTo(height);
    }

    @Then("the receipt signature is a vector of {int} paths in the view box {string}, {int} by {int} pixels, uploaded at {string}")
    public void theReceiptSignatureIsAVector(int paths, String viewBox, int width, int height, String uploadedAt) {
        JsonNode response = api.lastResponseJson();
        assertThat(response.get("configured").asBoolean()).isTrue();
        assertThat(response.get("kind").asString()).isEqualTo("VECTOR");
        assertThat(response.get("image").isNull()).isTrue();
        assertThat(response.get("width").asInt()).isEqualTo(width);
        assertThat(response.get("height").asInt()).isEqualTo(height);
        assertThat(response.get("uploadedAt").asString()).isEqualTo(uploadedAt);
        JsonNode vector = response.get("vector");
        assertThat(vector.get("viewBox").valueStream().map(JsonNode::asString).toList()).containsExactly(viewBox.split(" "));
        assertThat(vector.get("paths").size()).isEqualTo(paths);
        JsonNode first = vector.get("paths").get(0);
        assertThat(first.get("d").asString()).isEqualTo("M10 80 C40 10 65 10 95 80 S150 150 180 80 Z");
        assertThat(first.get("fill").asString()).isEqualTo("#1d2a5c");
        assertThat(first.get("opacity").decimalValue()).isEqualByComparingTo("0.9");
        assertThat(vector.properties()).extracting(Map.Entry::getKey).containsExactlyInAnyOrder("viewBox", "paths");
        assertThat(first.properties()).extracting(Map.Entry::getKey).containsExactlyInAnyOrder("d", "fill", "opacity");
    }

    private String signature() {
        return SIGNATURES + jdbc.sql("select person_id from donation_receipt_signatory").query(UUID.class).optional()
                .map(UUID::toString).orElse(UNKNOWN_PERSON);
    }

    private UUID personIdOf(String name) {
        return jdbc.sql("select id from content_person where name = ?").param(name).query(UUID.class).single();
    }

    private static byte[] jpeg(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, width, height);
        graphics.setColor(new Color(0x1d, 0x2a, 0x5c));
        graphics.fillRect(width / 4, height / 2 - 3, width / 2, 6);
        graphics.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpg", out);
        } catch (IOException impossible) {
            throw new UncheckedIOException(impossible);
        }
        return out.toByteArray();
    }
}
