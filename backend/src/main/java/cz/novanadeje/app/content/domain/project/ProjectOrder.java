package cz.novanadeje.app.content.domain.project;

public enum ProjectOrder {
    YEAR_THEN_CATEGORY,
    YEAR,
    CATEGORY_THEN_YEAR;

    public static final ProjectOrder DEFAULT = YEAR_THEN_CATEGORY;
    public static final String NAMES_PATTERN = "YEAR_THEN_CATEGORY|YEAR|CATEGORY_THEN_YEAR";
}
