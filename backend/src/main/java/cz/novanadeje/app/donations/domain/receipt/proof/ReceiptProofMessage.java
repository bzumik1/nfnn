package cz.novanadeje.app.donations.domain.receipt.proof;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

public final class ReceiptProofMessage {

    public static final String DOMAIN_TAG = "nfnn.cz/receipt/v1";
    private static final Pattern COMPANY_IDENTIFIER = Pattern.compile("[0-9]{8}");

    private ReceiptProofMessage() {
    }

    public static byte[] of(String foundationCompanyIdentifier, byte[] body) {
        if (foundationCompanyIdentifier == null || !COMPANY_IDENTIFIER.matcher(foundationCompanyIdentifier).matches()) {
            throw new IllegalArgumentException("The foundation's company identifier is eight digits: " + foundationCompanyIdentifier);
        }
        ByteArrayOutputStream message = new ByteArrayOutputStream();
        message.writeBytes(DOMAIN_TAG.getBytes(StandardCharsets.US_ASCII));
        message.write(0);
        message.writeBytes(new ProofBytesWriter().u32(Long.parseLong(foundationCompanyIdentifier)).toByteArray());
        message.writeBytes(body);
        return message.toByteArray();
    }
}
