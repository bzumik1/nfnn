package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.media.FocalPointService;
import cz.novanadeje.app.content.application.media.UploadImageService;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.UnsupportedImage;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/content/media")
class AdminMediaController {

    private final UploadImageService uploads;
    private final FocalPointService focalPoints;

    AdminMediaController(UploadImageService uploads, FocalPointService focalPoints) {
        this.uploads = uploads;
        this.focalPoints = focalPoints;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    UploadedImageResponse upload(@RequestPart("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new UnsupportedImage("it is empty");
        }
        try {
            return UploadedImageResponse.from(uploads.upload(file.getBytes()));
        } catch (IOException unreadable) {
            throw new UnsupportedImage("it could not be read");
        }
    }

    @PutMapping("/{id}")
    PhotoResponse change(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PhotoRequest request) {
        return PhotoResponse.from(focalPoints.place(UUID.fromString(jwt.getSubject()), new MediaId(id), request.toFocalPoint()));
    }
}
