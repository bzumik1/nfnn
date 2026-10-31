package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.news.NewsArticleCommand;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.Slug;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Optional;
import java.util.UUID;

public record NewsArticleRequest(
        @NotBlank @Size(max = NewsContent.MAX_TITLE_LENGTH) String title,
        @Size(max = Slug.MAX_LENGTH) @Pattern(regexp = "^$|" + Slug.SHAPE_REGEX) String slug,
        @Size(max = NewsContent.MAX_TAG_LENGTH) String tag,
        @NotBlank @Size(max = NewsContent.MAX_PEREX_LENGTH) String perex,
        @NotBlank @Size(max = NewsContent.MAX_BODY_LENGTH) String body,
        UUID coverImageId,
        @Size(max = NewsContent.MAX_COVER_IMAGE_ALT_LENGTH) String coverImageAlt,
        UUID signerId) {

    NewsArticleCommand toCommand() {
        return new NewsArticleCommand(title, Optional.ofNullable(slug), Optional.ofNullable(tag), perex, body,
                Optional.ofNullable(coverImageId).map(MediaId::new), Optional.ofNullable(coverImageAlt), Optional.ofNullable(signerId).map(PersonId::new));
    }
}
