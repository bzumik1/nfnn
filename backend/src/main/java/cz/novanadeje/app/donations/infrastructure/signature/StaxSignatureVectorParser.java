package cz.novanadeje.app.donations.infrastructure.signature;

import cz.novanadeje.app.donations.application.receipt.SignatureVectorParser;
import cz.novanadeje.app.donations.domain.receipt.SignaturePath;
import cz.novanadeje.app.donations.domain.receipt.SignaturePathData;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureVectorProblem;
import cz.novanadeje.app.donations.domain.receipt.SignatureViewBox;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureVector;
import org.springframework.stereotype.Component;

import javax.xml.XMLConstants;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.StringReader;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
class StaxSignatureVectorParser implements SignatureVectorParser {

    static final int MAX_DEPTH = 16;

    private static final String SVG_NAMESPACE = "http://www.w3.org/2000/svg";
    private static final String XML_VERSION = "1.0";
    private static final String XML_WHITESPACE = " \t\r\n";
    private static final String BLACK = "#000000";
    private static final Set<String> DROPPED_ELEMENTS = Set.of("metadata", "title", "desc");
    private static final Map<String, Set<String>> ALLOWED_ATTRIBUTES = Map.of(
            "svg", Set.of("viewBox", "width", "height", "version"),
            "g", Set.of("fill", "fill-opacity"),
            "path", Set.of("d", "fill", "fill-opacity", "opacity"));

    private final XMLInputFactory factory = hardenedFactory();

    @Override
    public SignatureVector parse(byte[] svg) {
        String document = decode(svg);
        try {
            return read(factory.createXMLStreamReader(new StringReader(document)));
        } catch (XMLStreamException | IllegalStateException | IllegalArgumentException malformed) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.MALFORMED);
        }
    }

    private static SignatureVector read(XMLStreamReader reader) throws XMLStreamException {
        Optional<SignatureViewBox> viewBox = Optional.empty();
        List<SignaturePath> paths = new ArrayList<>();
        Deque<Style> styles = new ArrayDeque<>();
        boolean rootSeen = false;
        if (!XML_VERSION.equals(Optional.ofNullable(reader.getVersion()).orElse(XML_VERSION))) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.MALFORMED);
        }
        while (reader.hasNext()) {
            int event = reader.next();
            switch (event) {
                case XMLStreamConstants.DTD, XMLStreamConstants.ENTITY_DECLARATION, XMLStreamConstants.NOTATION_DECLARATION ->
                        throw new UnsupportedSignatureVector(SignatureVectorProblem.DOCTYPE);
                case XMLStreamConstants.ENTITY_REFERENCE -> throw new UnsupportedSignatureVector(SignatureVectorProblem.MALFORMED);
                case XMLStreamConstants.PROCESSING_INSTRUCTION ->
                        throw new UnsupportedSignatureVector(SignatureVectorProblem.ELEMENT);
                case XMLStreamConstants.CHARACTERS, XMLStreamConstants.CDATA, XMLStreamConstants.SPACE -> {
                    if (!reader.isWhiteSpace() && !reader.getText().isBlank()) {
                        throw new UnsupportedSignatureVector(SignatureVectorProblem.TEXT);
                    }
                }
                case XMLStreamConstants.START_ELEMENT -> {
                    String name = reader.getLocalName();
                    if (!isSvgElement(reader)) {
                        throw new UnsupportedSignatureVector(SignatureVectorProblem.NAMESPACE);
                    }
                    if (styles.isEmpty()) {
                        if (rootSeen || !"svg".equals(name)) {
                            throw new UnsupportedSignatureVector(rootSeen ? SignatureVectorProblem.MALFORMED : SignatureVectorProblem.ELEMENT);
                        }
                        rootSeen = true;
                        viewBox = Optional.of(viewBox(reader));
                        styles.push(new Style(BLACK, BigDecimal.ONE, false));
                    } else if (styles.size() >= MAX_DEPTH) {
                        throw new UnsupportedSignatureVector(SignatureVectorProblem.TOO_COMPLEX);
                    } else if (styles.peek().leaf()) {
                        throw new UnsupportedSignatureVector(SignatureVectorProblem.ELEMENT);
                    } else if (DROPPED_ELEMENTS.contains(name)) {
                        skipSubtree(reader);
                    } else if ("g".equals(name)) {
                        styles.push(group(reader, styles.peek()));
                    } else if ("path".equals(name)) {
                        paths.add(path(reader, styles.peek()));
                        styles.push(new Style(BLACK, BigDecimal.ONE, true));
                    } else {
                        throw new UnsupportedSignatureVector(SignatureVectorProblem.ELEMENT);
                    }
                }
                case XMLStreamConstants.END_ELEMENT -> styles.pop();
                default -> {
                }
            }
        }
        if (!rootSeen) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.MALFORMED);
        }
        return new SignatureVector(viewBox.orElseThrow(), paths);
    }

    private static SignatureViewBox viewBox(XMLStreamReader reader) {
        Map<String, String> attributes = attributes(reader, "svg");
        String viewBox = attributes.get("viewBox");
        if (viewBox == null) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.VIEW_BOX);
        }
        return SignatureViewBox.parse(viewBox);
    }

    private static Style group(XMLStreamReader reader, Style inherited) {
        Map<String, String> attributes = attributes(reader, "g");
        String fill = Optional.ofNullable(attributes.get("fill")).map(SignaturePath::parseFill).orElse(inherited.fill());
        BigDecimal fillOpacity = Optional.ofNullable(attributes.get("fill-opacity")).map(SignaturePath::parseOpacity)
                .orElse(inherited.fillOpacity());
        return new Style(fill, fillOpacity, false);
    }

    private static SignaturePath path(XMLStreamReader reader, Style inherited) {
        Map<String, String> attributes = attributes(reader, "path");
        String data = attributes.get("d");
        if (data == null) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.PATH_DATA);
        }
        String fill = Optional.ofNullable(attributes.get("fill")).map(SignaturePath::parseFill).orElse(inherited.fill());
        BigDecimal fillOpacity = Optional.ofNullable(attributes.get("fill-opacity")).map(SignaturePath::parseOpacity)
                .orElse(inherited.fillOpacity());
        BigDecimal opacity = Optional.ofNullable(attributes.get("opacity")).map(SignaturePath::parseOpacity).orElse(BigDecimal.ONE);
        return new SignaturePath(SignaturePathData.parse(data), fill, fillOpacity.multiply(opacity));
    }

    private static Map<String, String> attributes(XMLStreamReader reader, String element) {
        Set<String> allowed = ALLOWED_ATTRIBUTES.get(element);
        Map<String, String> attributes = new HashMap<>();
        for (int index = 0; index < reader.getAttributeCount(); index++) {
            String namespace = reader.getAttributeNamespace(index);
            String prefix = reader.getAttributePrefix(index);
            String local = reader.getAttributeLocalName(index);
            boolean qualified = (namespace != null && !namespace.isEmpty()) || (prefix != null && !prefix.isEmpty());
            if (qualified || !allowed.contains(local)) {
                throw new UnsupportedSignatureVector(SignatureVectorProblem.ATTRIBUTE);
            }
            attributes.put(local, reader.getAttributeValue(index));
        }
        return attributes;
    }

    private static boolean isSvgElement(XMLStreamReader reader) {
        String namespace = reader.getNamespaceURI();
        return namespace == null || namespace.isEmpty() || SVG_NAMESPACE.equals(namespace);
    }


    private static void skipSubtree(XMLStreamReader reader) throws XMLStreamException {
        int depth = 1;
        while (depth > 0) {
            int event = reader.next();
            if (event == XMLStreamConstants.START_ELEMENT) {
                depth++;
            } else if (event == XMLStreamConstants.END_ELEMENT) {
                depth--;
            } else if (event == XMLStreamConstants.ENTITY_REFERENCE) {
                throw new UnsupportedSignatureVector(SignatureVectorProblem.MALFORMED);
            }
        }
    }

    private static String decode(byte[] svg) {
        if (svg == null) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.MALFORMED);
        }
        try {
            String text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(svg))
                    .toString();
            int start = text.startsWith("﻿") ? 1 : 0;
            while (start < text.length() && XML_WHITESPACE.indexOf(text.charAt(start)) >= 0) {
                start++;
            }
            return text.substring(start);
        } catch (CharacterCodingException notUtf8) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.MALFORMED);
        }
    }

    private static XMLInputFactory hardenedFactory() {
        XMLInputFactory factory = XMLInputFactory.newDefaultFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
        factory.setProperty(XMLInputFactory.IS_NAMESPACE_AWARE, true);
        factory.setProperty(XMLInputFactory.IS_COALESCING, false);
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        factory.setXMLResolver((publicId, systemId, baseUri, namespace) -> {
            throw new XMLStreamException("External resources are refused");
        });
        return factory;
    }

    private record Style(String fill, BigDecimal fillOpacity, boolean leaf) {
    }
}
