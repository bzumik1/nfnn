package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.domain.DonorType;

import java.time.LocalDate;
import java.time.Year;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

public final class ReceiptProofBody {

    public static final int FORMAT = 1;
    public static final int KEY_ID_OFFSET = 1;
    private static final int FLAGS_OFFSET = KEY_ID_OFFSET + ReceiptSigningKeyId.BYTES;
    private static final int YEARLY = 1;
    private static final int COMPANY = 1 << 1;
    private static final int REPLACES = 1 << 2;
    private static final int CZECH_POSTAL_CODE = 1 << 3;
    private static final int RESERVED = 0xf0;
    private static final LocalDate EPOCH = LocalDate.of(2000, 1, 1);
    private static final int LAST_DAY = 0xffff;
    private static final int FIRST_YEAR = 2000;
    private static final Pattern CZECH_POSTAL_CODE_FORM = Pattern.compile("[0-9]{3} [0-9]{2}");
    private static final int LARGEST_POSTAL_CODE = 99_999;
    private static final long LARGEST_COMPANY_IDENTIFIER = 99_999_999;

    private ReceiptProofBody() {
    }

    public static byte[] encode(SignedReceipt receipt, ReceiptSigningKeyId keyId) {
        boolean czechPostalCode = CZECH_POSTAL_CODE_FORM.matcher(receipt.donor().postalCode()).matches();
        int flags = (receipt.kind() == ReceiptKind.YEARLY ? YEARLY : 0)
                | (receipt.donor().type() == DonorType.COMPANY ? COMPANY : 0)
                | (receipt.replaces().isPresent() ? REPLACES : 0)
                | (czechPostalCode ? CZECH_POSTAL_CODE : 0);
        ProofBytesWriter body = new ProofBytesWriter().u8(FORMAT).raw(keyId.bytes()).u8(flags)
                .u24(serial(receipt.number())).u16(day(receipt.issuedOn()));
        receipt.year().ifPresent(year -> body.u16(year.getValue()));
        receipt.replaces().ifPresent(replaced -> body.u24(serial(replaced.number())).u16(day(replaced.issuedOn())));
        body.text(receipt.donor().name()).text(receipt.donor().street()).text(receipt.donor().city());
        if (czechPostalCode) {
            body.u24(Integer.parseInt(receipt.donor().postalCode().replace(" ", "")));
        } else {
            body.text(receipt.donor().postalCode());
        }
        receipt.donor().companyIdentifier().ifPresent(identifier -> body.u32(Long.parseLong(identifier)));
        body.varint(receipt.gifts().size());
        receipt.gifts().forEach(gift -> body.u16(day(gift.receivedOn())).varint(gift.amountMinor()));
        return body.varint(receipt.totalMinor()).toByteArray();
    }

    public static ReceiptSigningKeyId keyIdOf(byte[] body) {
        if (body.length < FLAGS_OFFSET) {
            throw new InvalidReceiptProof(ReceiptProofRejection.TRUNCATED);
        }
        return ReceiptSigningKeyId.fromBytes(Arrays.copyOfRange(body, KEY_ID_OFFSET, FLAGS_OFFSET));
    }

    public static SignedReceipt parse(byte[] body) {
        ProofBytesReader reader = new ProofBytesReader(body, FLAGS_OFFSET);
        int flags = reader.u8();
        if ((flags & RESERVED) != 0) {
            throw new InvalidReceiptProof(ReceiptProofRejection.RESERVED_FLAGS);
        }
        boolean yearly = (flags & YEARLY) != 0;
        int serial = reader.u24();
        LocalDate issuedOn = date(reader.u16());
        ReceiptNumber number = number(issuedOn, serial);
        Optional<Year> year = yearly ? Optional.of(year(reader.u16())) : Optional.empty();
        Optional<ReplacedReceipt> replaces = Optional.empty();
        if ((flags & REPLACES) != 0) {
            int replacedSerial = reader.u24();
            LocalDate replacedOn = date(reader.u16());
            replaces = Optional.of(new ReplacedReceipt(number(replacedOn, replacedSerial), replacedOn));
        }
        SignedDonor donor = donor(reader, flags);
        long count = reader.varint();
        if (count < 1 || !yearly && count != 1) {
            throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
        }
        List<SignedGift> gifts = new ArrayList<>();
        long sum = 0;
        for (long index = 0; index < count; index++) {
            SignedGift gift = gift(reader, gifts, year);
            sum += gift.amountMinor();
            if (sum >= ProofBytesReader.MAX_VARINT) {
                throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
            }
            gifts.add(gift);
        }
        long total = reader.varint();
        if (!reader.atEnd()) {
            throw new InvalidReceiptProof(ReceiptProofRejection.TRAILING_BYTES);
        }
        if (total != sum) {
            throw new InvalidReceiptProof(ReceiptProofRejection.TOTAL_MISMATCH);
        }
        return new SignedReceipt(yearly ? ReceiptKind.YEARLY : ReceiptKind.SINGLE, number, issuedOn, year, replaces, donor, gifts, total);
    }

    private static SignedDonor donor(ProofBytesReader reader, int flags) {
        String name = reader.text();
        String street = reader.text();
        String city = reader.text();
        String postalCode;
        if ((flags & CZECH_POSTAL_CODE) != 0) {
            int code = reader.u24();
            if (code > LARGEST_POSTAL_CODE) {
                throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
            }
            String digits = String.format("%05d", code);
            postalCode = digits.substring(0, 3) + " " + digits.substring(3);
        } else {
            postalCode = reader.text();
        }
        Optional<String> companyIdentifier = Optional.empty();
        if ((flags & COMPANY) != 0) {
            long identifier = reader.u32();
            if (identifier > LARGEST_COMPANY_IDENTIFIER) {
                throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
            }
            companyIdentifier = Optional.of(String.format("%08d", identifier));
        }
        return new SignedDonor(companyIdentifier.isPresent() ? DonorType.COMPANY : DonorType.PERSON, name, street, city, postalCode,
                companyIdentifier);
    }

    private static SignedGift gift(ProofBytesReader reader, List<SignedGift> earlier, Optional<Year> year) {
        LocalDate receivedOn = date(reader.u16());
        long amount = reader.varint();
        boolean outOfOrder = !earlier.isEmpty() && receivedOn.isBefore(earlier.getLast().receivedOn());
        boolean outsideYear = year.filter(covered -> !Year.from(receivedOn).equals(covered)).isPresent();
        if (amount < 1 || outOfOrder || outsideYear) {
            throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
        }
        return new SignedGift(receivedOn, amount);
    }

    private static int serial(ReceiptNumber number) {
        return Integer.parseInt(number.value().substring(number.value().indexOf('-') + 1));
    }

    private static ReceiptNumber number(LocalDate issuedOn, int serial) {
        if (serial < ReceiptNumber.FIRST_SERIAL || serial > ReceiptNumber.LAST_SERIAL) {
            throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
        }
        return ReceiptNumber.of(Year.from(issuedOn), serial);
    }

    private static Year year(int value) {
        if (value < FIRST_YEAR) {
            throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
        }
        return Year.of(value);
    }

    private static int day(LocalDate date) {
        long days = date.toEpochDay() - EPOCH.toEpochDay();
        if (days < 0 || days > LAST_DAY) {
            throw new IllegalArgumentException("A receipt proof holds days from 2000-01-01 to " + EPOCH.plusDays(LAST_DAY) + ": " + date);
        }
        return (int) days;
    }

    private static LocalDate date(int days) {
        return EPOCH.plusDays(days);
    }
}
