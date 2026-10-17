package cz.novanadeje.app.cucumber;

import io.cucumber.java.ParameterType;

import java.time.LocalDate;

public class ParameterTypes {

    @ParameterType("\\d{4}-\\d{2}-\\d{2}")
    public LocalDate date(String iso) {
        return LocalDate.parse(iso);
    }
}
