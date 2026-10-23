package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.media.MediaQueryService;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import jakarta.validation.constraints.Min;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/content/media")
class MediaController {

    static final String WIDTH_HEADER = "X-Image-Width";
    static final String HEIGHT_HEADER = "X-Image-Height";
    private static final MediaType WEBP = MediaType.parseMediaType("image/webp");
    private static final CacheControl FOREVER = CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable();

    private final MediaQueryService media;

    MediaController(MediaQueryService media) {
        this.media = media;
    }

    @GetMapping("/{id}")
    ResponseEntity<byte[]> variant(@PathVariable UUID id, @RequestParam(name = "w", required = false) @Min(1) Integer width) {
        MediaVariant variant = media.variant(new MediaId(id), Optional.ofNullable(width));
        return ResponseEntity.ok()
                .contentType(WEBP)
                .cacheControl(FOREVER)
                .header(WIDTH_HEADER, String.valueOf(variant.width()))
                .header(HEIGHT_HEADER, String.valueOf(variant.height()))
                .body(variant.webp());
    }
}
