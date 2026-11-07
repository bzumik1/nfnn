package cz.novanadeje.app.donations.infrastructure.cnb;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

final class CnbBankCodeCsv {

    static final String HEADER = "Kód platebního styku;Poskytovatel platebních služeb;BIC kód (SWIFT);Systém CERTIS";

    private static final char BYTE_ORDER_MARK = '﻿';
    private static final Pattern LINE_END = Pattern.compile("\r?\n");
    private static final int FIELDS = 4;

    private CnbBankCodeCsv() {
    }

    static BankCodeList parse(byte[] bytes) {
        List<String> lines = new ArrayList<>(Arrays.asList(LINE_END.split(withoutByteOrderMark(decode(bytes)), -1)));
        if (lines.getLast().isEmpty()) {
            lines.removeLast();
        }
        if (lines.isEmpty() || !HEADER.equals(lines.getFirst())) {
            throw new IllegalArgumentException("The bank code list does not start with the ČNB header");
        }
        List<String> rows = lines.subList(1, lines.size());
        if (rows.size() > BankCodeList.MAX_SIZE) {
            throw new IllegalArgumentException("The bank code list has more than " + BankCodeList.MAX_SIZE + " rows");
        }
        return new BankCodeList(rows.stream().map(CnbBankCodeCsv::bank).toList());
    }

    private static CzechBank bank(String row) {
        String[] fields = row.split(";", -1);
        if (fields.length != FIELDS) {
            throw new IllegalArgumentException("A row of the bank code list has " + FIELDS + " fields");
        }
        return new CzechBank(new BankCode(fields[0].strip()), new BankName(fields[1]));
    }

    private static String decode(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException notUtf8) {
            throw new IllegalArgumentException("The bank code list is not UTF-8");
        }
    }

    private static String withoutByteOrderMark(String text) {
        return !text.isEmpty() && text.charAt(0) == BYTE_ORDER_MARK ? text.substring(1) : text;
    }
}
