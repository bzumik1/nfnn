package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

@Entity
@Table(name = "bank_code")
class BankCodeJpaEntity implements Persistable<String> {

    @Id
    @Column(name = "code", length = BankCode.LENGTH)
    private String code;

    @Column(name = "name", nullable = false, length = BankName.MAX_LENGTH)
    private String name;

    @Transient
    private boolean fresh;

    protected BankCodeJpaEntity() {
    }

    static BankCodeJpaEntity fromDomain(CzechBank bank) {
        BankCodeJpaEntity entity = new BankCodeJpaEntity();
        entity.code = bank.code().value();
        entity.name = bank.name().value();
        entity.fresh = true;
        return entity;
    }

    CzechBank toDomain() {
        return new CzechBank(new BankCode(code), new BankName(name));
    }

    @Override
    public String getId() {
        return code;
    }

    @Override
    public boolean isNew() {
        return fresh;
    }
}
