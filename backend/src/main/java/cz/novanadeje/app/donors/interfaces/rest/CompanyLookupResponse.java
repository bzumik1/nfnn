package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.RegisteredCompany;
import cz.novanadeje.app.shared.domain.PostalAddress;

record CompanyLookupResponse(String companyIdentifier, String name, Address address) {

    static CompanyLookupResponse of(RegisteredCompany company) {
        return new CompanyLookupResponse(company.identifier().value(), company.name(), company.seat().map(Address::of).orElse(null));
    }

    record Address(String street, String city, String postalCode) {

        static Address of(PostalAddress address) {
            return new Address(address.street(), address.city(), address.postalCode());
        }
    }
}
