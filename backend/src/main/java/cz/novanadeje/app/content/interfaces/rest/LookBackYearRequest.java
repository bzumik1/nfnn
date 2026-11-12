package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.news.NewsArticle;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.util.Optional;

public record LookBackYearRequest(@Min(NewsArticle.MIN_LOOK_BACK_YEAR) @Max(NewsArticle.MAX_LOOK_BACK_YEAR) Integer year) {

    Optional<Integer> chosenYear() {
        return Optional.ofNullable(year);
    }
}
