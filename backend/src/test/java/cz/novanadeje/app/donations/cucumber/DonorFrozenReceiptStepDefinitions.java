package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceiptCases;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofMessage;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofReader;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofText;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import cz.novanadeje.app.donations.interfaces.rest.FrozenReceiptResponse;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorFrozenReceiptStepDefinitions {

    private static final String RECEIPTS_PATH = "/api/donations/me/receipts";
    private static final String IMAGES_PATH = "/api/donations/me/receipt-images/";
    private static final String QR_PREFIX = "https://nfnn.cz/overit#1";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final ReceiptSigner signer;
    private final DonationReceiptRepository receipts;
    private final List<JsonNode> issued = new ArrayList<>();
    private Optional<Downloaded> downloaded = Optional.empty();
    private Optional<String> signatureImageSeen = Optional.empty();
    private Optional<String> portraitImageSeen = Optional.empty();

    public DonorFrozenReceiptStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, ReceiptSigner signer,
                                             DonationReceiptRepository receipts) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.signer = signer;
        this.receipts = receipts;
    }

    @When("{string} issues her/his/its yearly receipt for {int}")
    public void issuesTheYearlyReceipt(String alias, int year) {
        issueAs(alias, Map.of("year", year));
    }

    @When("{string} issued her/his/its yearly receipt for {int} {int} times")
    public void issuedTheYearlyReceiptTimes(String alias, int year, int times) {
        for (int request = 0; request < times; request++) {
            issuesTheYearlyReceipt(alias, year);
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @Given("the receipt numbering has used the serials up to {long}")
    public void theReceiptNumberingHasUsedTheSerialsUpTo(long serial) {
        jdbc.sql("select setval('donation_receipt_number_seq', ?)").param(serial).query(Long.class).single();
    }

    @Given("{string} changed her/his address and issued her/his yearly receipt for {int} {int} times")
    public void changedTheAddressAndIssuedTheYearlyReceiptTimes(String alias, int year, int times) {
        for (int round = 1; round <= times; round++) {
            sessions.actAs(alias);
            assertThat(api.patch("/api/donors/me", Map.of("address", Map.of("street", "Dlouhá " + round, "city", "Ústí nad Labem", "postalCode", "400 01")))
                    .getStatusCode().value()).isEqualTo(200);
            issuesTheYearlyReceipt(alias, year);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Issue %d answered %s", round, api.lastResponse().getBody()).isEqualTo(200);
        }
    }

    @When("{string} issues the receipt of her/his/its donation received on {date}")
    public void issuesTheReceiptOfTheirDonation(String alias, LocalDate receivedOn) {
        issueAs(alias, Map.of("donationId", donationIdOf(alias, receivedOn).toString()));
    }

    @When("{string} issues the receipt of each of her/his/its donations")
    public void issuesTheReceiptOfEachOfTheirDonations(String alias) {
        List<UUID> donations = jdbc.sql("select id from donation where donor_id = ? order by received_on, id")
                .param(scenarioDonors.idOf(alias))
                .query(UUID.class)
                .list();
        for (UUID donation : donations) {
            issuesTheReceiptOfDonation(alias, donation.toString());
            assertThat(api.lastResponse().getStatusCode().value())
                    .withFailMessage("Donation %d of %d answered %s", donations.indexOf(donation) + 1, donations.size(), api.lastResponse().getBody())
                    .isEqualTo(200);
        }
    }

    @When("{string} issues the receipt of the donation of {string} received on {date}")
    public void issuesTheReceiptOfSomeoneElsesDonation(String alias, String owner, LocalDate receivedOn) {
        issueAs(alias, Map.of("donationId", donationIdOf(owner, receivedOn).toString()));
    }

    @When("{string} issues the receipt of donation {string}")
    public void issuesTheReceiptOfDonation(String alias, String donationId) {
        issueAs(alias, Map.of("donationId", donationId));
    }

    @When("{string} asks to issue a receipt naming the year {string} and the donation {string}")
    public void asksToIssueAReceiptNaming(String alias, String year, String donationId) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (!year.isEmpty()) {
            body.put("year", Long.parseLong(year));
        }
        if (!donationId.isEmpty()) {
            body.put("donationId", donationId);
        }
        issueAs(alias, body);
    }

    @When("{string} lists her/his/its receipts")
    public void listsTheReceipts(String alias) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH);
    }

    @When("{string} reads the issued receipt again")
    public void readsTheIssuedReceiptAgain(String alias) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "/" + lastIssued().get("id").asString());
    }

    @When("{string} reads receipt {string}")
    public void readsReceipt(String alias, String number) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "/" + receiptIdOf(number));
    }

    @When("{string} reads the receipt with id {string}")
    public void readsTheReceiptWithId(String alias, String id) {
        sessions.actAs(alias);
        api.get(RECEIPTS_PATH + "/" + id);
    }

    @When("{string} fetches the signature image of receipt {string}")
    public void fetchesTheSignatureImageOfReceipt(String alias, String number) {
        sessions.actAs(alias);
        api.getBytes(IMAGES_PATH + signatureImageOf(number));
    }

    @When("{string} fetches the portrait image of receipt {string}")
    public void fetchesThePortraitImageOfReceipt(String alias, String number) {
        sessions.actAs(alias);
        api.getBytes(IMAGES_PATH + portraitImageOf(number));
    }

    @When("{string} fetches the receipt image {string}")
    public void fetchesTheReceiptImage(String alias, String digest) {
        sessions.actAs(alias);
        api.getBytes(IMAGES_PATH + digest);
    }

    @When("someone without a token issues the yearly receipt for {int}")
    public void someoneWithoutATokenIssuesTheYearlyReceipt(int year) {
        api.forgetCredentials();
        api.post(RECEIPTS_PATH, Map.of("year", year));
    }

    @When("someone without a token lists the receipts")
    public void someoneWithoutATokenListsTheReceipts() {
        api.forgetCredentials();
        api.get(RECEIPTS_PATH);
    }

    @When("someone without a token reads the receipt with id {string}")
    public void someoneWithoutATokenReadsTheReceipt(String id) {
        api.forgetCredentials();
        api.get(RECEIPTS_PATH + "/" + id);
    }

    @When("someone without a token fetches the receipt image {string}")
    public void someoneWithoutATokenFetchesTheReceiptImage(String digest) {
        api.forgetCredentials();
        api.getBytes(IMAGES_PATH + digest);
    }

    @Then("the receipt {string} downloaded is the frozen receipt issued to her/him/it last")
    public void theReceiptDownloadedIsTheFrozenReceiptIssuedLast(String alias) {
        assertThat(api.lastResponse().getHeaders().getContentType()).hasToString("application/pdf");
        DonationReceipt receipt = receipts.findByDonorNewestFirst(new DonorReference(scenarioDonors.idOf(alias))).getFirst();
        ObjectNode answer = JSON.createObjectNode()
                .put("id", receipt.id().value().toString())
                .put("status", receipt.status().name())
                .put("kind", receipt.kind().name())
                .put("number", receipt.number().value());
        answer.set("receipt", JSON.valueToTree(FrozenReceiptResponse.from(receipt.frozen())));
        downloaded = Optional.of(new Downloaded(api.lastResponse(), answer));
    }

    @Then("the answer is JSON that must not be cached")
    public void theAnswerIsJsonThatMustNotBeCached() {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(headers.getContentType()).hasToString("application/json");
        assertThat(headers.getCacheControl()).isEqualTo("private, no-store");
    }

    @Then("the issued receipt has number {string}")
    public void theIssuedReceiptHasNumber(String number) {
        assertThat(answeredReceipt().get("number").asString()).isEqualTo(number);
        assertThat(answeredReceipt().get("receipt").get("number").asString()).isEqualTo(number);
    }

    @Then("the issued receipt is {word}")
    public void theIssuedReceiptIs(String status) {
        assertThat(answeredReceipt().get("status").asString()).isEqualTo(status.toUpperCase(Locale.ROOT));
    }

    @Then("the issued receipt is the yearly receipt for {int}")
    public void theIssuedReceiptIsTheYearlyReceiptFor(int year) {
        JsonNode receipt = answeredReceipt();
        assertThat(receipt.get("kind").asString()).isEqualTo("YEARLY");
        assertThat(receipt.get("year").asInt()).isEqualTo(year);
        assertThat(receipt.get("donationId").isNull()).isTrue();
        assertThat(receipt.get("receipt").get("year").asInt()).isEqualTo(year);
    }

    @Then("the issued receipt is the single receipt of the donation of {string} received on {date}")
    public void theIssuedReceiptIsTheSingleReceiptOf(String alias, LocalDate receivedOn) {
        JsonNode receipt = answeredReceipt();
        assertThat(receipt.get("kind").asString()).isEqualTo("SINGLE");
        assertThat(receipt.get("donationId").asString()).isEqualTo(donationIdOf(alias, receivedOn).toString());
        assertThat(receipt.get("year").isNull()).isTrue();
        assertThat(receipt.get("receipt").get("gifts")).hasSize(1);
        assertThat(receipt.get("receipt").get("gifts").get(0).get("receivedOn").asString()).isEqualTo(receivedOn.toString());
    }

    @Then("the issued receipt is the one issued before")
    public void theIssuedReceiptIsTheOneIssuedBefore() {
        assertThat(issued).withFailMessage("Fewer than two receipts were issued").hasSizeGreaterThanOrEqualTo(2);
        assertThat(issued.getLast()).isEqualTo(issued.get(issued.size() - 2));
    }

    @Then("the frozen receipt holds:")
    public void theFrozenReceiptHolds(DataTable table) {
        JsonNode frozen = answeredReceipt().get("receipt");
        for (Map<String, String> row : table.asMaps()) {
            JsonNode value = at(frozen, row.get("field"));
            String expected = scenarioDonors.resolve(row.get("value"));
            if (expected == null || "null".equals(expected)) {
                assertThat(value.isNull()).withFailMessage("%s is %s, not null", row.get("field"), value).isTrue();
            } else {
                assertThat(value.isString() ? value.asString() : value.toString()).as(row.get("field")).isEqualTo(expected);
            }
        }
    }

    @Then("the frozen receipt lists the gifts:")
    public void theFrozenReceiptListsTheGifts(DataTable table) {
        JsonNode frozen = answeredReceipt().get("receipt");
        List<String> gifts = frozen.get("gifts").valueStream()
                .map(gift -> gift.get("receivedOn").asString() + " " + gift.get("amountMinor").asLong() + " " + gift.get("source").asString()).toList();
        assertThat(gifts).containsExactlyElementsOf(table.asMaps().stream()
                .map(row -> row.get("receivedOn") + " " + row.get("amountMinor") + " " + row.getOrDefault("source", "BANK_TRANSFER")).toList());
        assertThat(frozen.get("total").get("amountMinor").asLong())
                .isEqualTo(frozen.get("gifts").valueStream().mapToLong(gift -> gift.get("amountMinor").asLong()).sum());
        assertThat(frozen.get("total").get("currency").asString()).isEqualTo("CZK");
    }

    @Then("the frozen receipt carries the Czech texts only")
    public void theFrozenReceiptCarriesTheCzechTextsOnly() {
        JsonNode texts = answeredReceipt().get("receipt").get("texts");
        assertThat(texts.get("cs").get("receipt.title.single").asString()).isEqualTo("Potvrzení o přijetí daru");
        assertThat(texts.get("en").isNull()).isTrue();
    }

    @Then("the frozen receipt carries the Czech and the English texts")
    public void theFrozenReceiptCarriesTheCzechAndTheEnglishTexts() {
        JsonNode texts = answeredReceipt().get("receipt").get("texts");
        assertThat(texts.get("cs").get("receipt.title.single").asString()).isEqualTo("Potvrzení o přijetí daru");
        assertThat(texts.get("en").get("receipt.title.single").asString()).isEqualTo("Confirmation of a donation received");
    }

    @Then("the frozen receipt is signed with the server's key")
    public void theFrozenReceiptIsSignedWithTheServersKey() {
        JsonNode verification = answeredReceipt().get("receipt").get("verification");
        assertThat(verification.get("keyId").asString()).isEqualTo(signer.keyId().value());
        assertThat(verification.get("qrText").asString()).startsWith(QR_PREFIX).matches("https://nfnn\\.cz/overit#1[0-9]+");
    }

    @Then("the frozen receipt's proof reads back as the receipt served, under the status digest stored for it")
    public void theProofReadsBackAsTheReceiptServed() {
        JsonNode answer = answeredReceipt();
        JsonNode receipt = answer.get("receipt");
        String qrText = receipt.get("verification").get("qrText").asString();
        String companyIdentifier = receipt.get("foundation").get("companyIdentifier").asString();

        ReceiptProofReader.ReadProof read = ReceiptProofReader.read(qrText, companyIdentifier,
                keyId -> keyId.equals(signer.keyId()) ? Optional.of(new ReceiptProofReader.KnownKey(keyId, signer.publicKey(), false)) : Optional.empty(),
                signer);

        assertThat(read.keyId().value()).isEqualTo(receipt.get("verification").get("keyId").asString());
        assertThat(read.receipt()).isEqualTo(SignedReceipt.of(FrozenReceiptCases.documentOf(receipt)));
        assertThat(read.receipt().number().value()).isEqualTo(answer.get("number").asString());
        byte[] proof = ReceiptProofText.read(qrText);
        byte[] body = Arrays.copyOf(proof, proof.length - ReceiptProof.SIGNATURE_BYTES);
        byte[] message = ReceiptProofMessage.of(companyIdentifier, body);
        byte[] signedMessageAndSignature = Arrays.copyOf(message, message.length + ReceiptProof.SIGNATURE_BYTES);
        System.arraycopy(proof, body.length, signedMessageAndSignature, message.length, ReceiptProof.SIGNATURE_BYTES);
        assertThat(jdbc.sql("select status_sha256 from issued_receipt where id = ?").param(UUID.fromString(answer.get("id").asString()))
                .query(String.class).single()).isEqualTo(sha256(signedMessageAndSignature));
    }

    @Then("its proof differs from the receipt it replaces")
    public void itsProofDiffersFromTheReceiptItReplaces() {
        JsonNode receipt = answeredReceipt().get("receipt");
        String replaced = receipt.get("replaces").get("number").asString();
        Map<String, Object> distinct = jdbc.sql("select count(*) as receipts, count(distinct proof) as proofs, count(distinct status_sha256) as digests"
                        + " from issued_receipt where number in (?, ?)")
                .params(receipt.get("number").asString(), replaced).query().singleRow();
        assertThat(distinct).containsEntry("receipts", 2L).containsEntry("proofs", 2L).containsEntry("digests", 2L);
    }

    @Then("the frozen receipt shows no signature image")
    public void theFrozenReceiptShowsNoSignatureImage() {
        assertThat(answeredReceipt().get("receipt").get("signatory").get("signatureImage").isNull()).isTrue();
    }

    @Then("the frozen receipt shows the current signature image")
    public void theFrozenReceiptShowsTheCurrentSignatureImage() {
        String shown = answeredReceipt().get("receipt").get("signatory").get("signatureImage").get("sha256").asString();
        assertThat(shown).isEqualTo(currentSignatureImage());
        signatureImageSeen = Optional.of(shown);
    }

    @Then("the frozen receipt still shows the signature image it showed before")
    public void theFrozenReceiptStillShowsTheSignatureImageItShowedBefore() {
        String before = signatureImageSeen.orElseThrow(() -> new AssertionError("No signature image was seen before"));
        assertThat(answeredReceipt().get("receipt").get("signatory").get("signatureImage").get("sha256").asString())
                .isEqualTo(before)
                .isNotEqualTo(currentSignatureImage());
    }

    @Then("the frozen receipt shows no portrait")
    public void theFrozenReceiptShowsNoPortrait() {
        assertThat(answeredReceipt().get("receipt").get("signatory").get("portraitImage").isNull()).isTrue();
    }

    @Then("the frozen receipt shows a portrait of the signatory")
    public void theFrozenReceiptShowsAPortraitOfTheSignatory() {
        JsonNode portrait = answeredReceipt().get("receipt").get("signatory").get("portraitImage");
        assertThat(portrait.isNull()).withFailMessage("The frozen receipt shows no portrait").isFalse();
        String shown = portrait.get("sha256").asString();
        assertThat(jdbc.sql("select media_type from receipt_image where sha256 = ?").param(shown).query(String.class).single()).isEqualTo("image/jpeg");
        portraitImageSeen = Optional.of(shown);
    }

    @Then("the frozen receipt shows another portrait than before")
    public void theFrozenReceiptShowsAnotherPortraitThanBefore() {
        String before = portraitImageSeen.orElseThrow(() -> new AssertionError("No portrait was seen before"));
        theFrozenReceiptShowsAPortraitOfTheSignatory();
        assertThat(portraitImageSeen).isNotEqualTo(Optional.of(before));
    }

    @Then("the frozen receipt still shows the portrait it showed before")
    public void theFrozenReceiptStillShowsThePortraitItShowedBefore() {
        String before = portraitImageSeen.orElseThrow(() -> new AssertionError("No portrait was seen before"));
        assertThat(answeredReceipt().get("receipt").get("signatory").get("portraitImage").get("sha256").asString()).isEqualTo(before);
    }

    @Then("the image is a {int} pixel square JPEG portrait, kept by the browser and never sniffed as another type")
    public void theImageIsASquareJpegPortrait(int side) throws IOException {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(headers.getContentType()).hasToString("image/jpeg");
        assertThat(headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(headers.getCacheControl()).isEqualTo("private, max-age=31536000, immutable");
        BufferedImage portrait = ImageIO.read(new ByteArrayInputStream(api.lastResponseBytes()));
        assertThat(portrait.getWidth()).isEqualTo(side);
        assertThat(portrait.getHeight()).isEqualTo(side);
    }

    @Then("the image is the current vector signature as its canonical JSON, never sniffed as another type")
    public void theImageIsTheCurrentVectorSignature() {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(headers.getContentType()).hasToString("application/json");
        assertThat(headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(headers.getCacheControl()).isEqualTo("private, max-age=31536000, immutable");
        assertThat(sha256(api.lastResponseBytes())).isEqualTo(currentSignatureImage());
        JsonNode vector = JSON.readTree(api.lastResponseBytes());
        assertThat(vector.properties()).extracting(Map.Entry::getKey).containsExactly("viewBox", "paths");
        assertThat(vector.get("paths").get(0).properties()).extracting(Map.Entry::getKey).containsExactly("d", "fill", "opacity");
    }

    @Then("the image is the current signature, kept by the browser")
    public void theImageIsTheCurrentSignature() {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(headers.getContentType()).hasToString("image/png");
        assertThat(headers.getCacheControl()).isEqualTo("private, max-age=31536000, immutable");
        assertThat(sha256(api.lastResponseBytes())).isEqualTo(currentSignatureImage());
    }

    @Then("the receipt list shows:")
    public void theReceiptListShows(DataTable table) {
        JsonNode items = api.lastResponseJson().get("items");
        assertThat(items).withFailMessage("No items in %s", api.lastResponse().getBody()).isNotNull();
        assertThat(items.valueStream().map(item -> item.get("number").asString() + " " + item.get("status").asString() + " " + item.get("kind").asString()).toList())
                .containsExactlyElementsOf(table.asMaps().stream().map(row -> row.get("number") + " " + row.get("status") + " " + row.get("kind")).toList());
    }

    @Then("the receipt list is empty")
    public void theReceiptListIsEmpty() {
        assertThat(api.lastResponseJson().get("items")).isEmpty();
    }

    @Then("receipt {string} is kept as its frozen data")
    public void receiptIsKeptAsItsFrozenData(String number) {
        Map<String, Object> row = jdbc.sql("select frozen, schema_version, signing_key_id, status_sha256 from issued_receipt where number = ?")
                .param(number).query().singleRow();
        assertThat((String) row.get("frozen")).contains("\"number\":\"" + number + "\"").contains("\"texts\":{\"cs\":{").doesNotContain("data:image");
        assertThat(((Number) row.get("schema_version")).intValue()).isEqualTo(1);
        assertThat(row.get("signing_key_id")).isEqualTo(signer.keyId().value());
        assertThat((String) row.get("status_sha256")).matches("[0-9a-f]{64}");
    }

    private void issueAs(String alias, Map<String, ?> body) {
        sessions.actAs(alias);
        api.post(RECEIPTS_PATH, body);
        if (api.lastResponse().getStatusCode().is2xxSuccessful()) {
            issued.add(api.lastResponseJson());
        }
    }

    private JsonNode lastIssued() {
        assertThat(issued).withFailMessage("No receipt was issued").isNotEmpty();
        return issued.getLast();
    }

    private JsonNode answeredReceipt() {
        if (downloaded.isPresent() && downloaded.get().response() == api.lastResponse()) {
            return downloaded.get().receipt();
        }
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("receipt")).withFailMessage("No frozen receipt in %s", api.lastResponse().getBody()).isNotNull();
        return answer;
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode value = node;
        for (String part : path.split("\\.")) {
            value = value.isArray() ? value.get(Integer.parseInt(part)) : value.get(part);
            assertThat(value).withFailMessage("No %s in %s", path, node).isNotNull();
        }
        return value;
    }

    private UUID donationIdOf(String alias, LocalDate receivedOn) {
        return jdbc.sql("select id from donation where donor_id = ? and received_on = ?")
                .params(scenarioDonors.idOf(alias), receivedOn)
                .query(UUID.class)
                .single();
    }

    private UUID receiptIdOf(String number) {
        return jdbc.sql("select id from issued_receipt where number = ?").param(number).query(UUID.class).single();
    }

    private String signatureImageOf(String number) {
        return jdbc.sql("select signature_image_sha256 from issued_receipt where number = ?").param(number).query(String.class).single();
    }

    private String portraitImageOf(String number) {
        return jdbc.sql("select portrait_image_sha256 from issued_receipt where number = ?").param(number).query(String.class).single();
    }

    private String currentSignatureImage() {
        Optional<String> digest = jdbc.sql("select s.image_sha256 from donation_person_receipt_signature s"
                + " join donation_receipt_signatory c on c.person_id = s.person_id").query(String.class).optional();
        return digest.orElseThrow(() -> new AssertionError("No receipt signature is set"));
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private record Downloaded(Object response, JsonNode receipt) {
    }
}
