package cz.novanadeje.app.operations.interfaces.rest;

import jakarta.validation.constraints.Size;

record SetupCodeRequest(@Size(max = MAX_CODE_LENGTH) String code) {

    static final int MAX_CODE_LENGTH = 40;

    @Override
    public String toString() {
        return "SetupCodeRequest[********]";
    }
}
