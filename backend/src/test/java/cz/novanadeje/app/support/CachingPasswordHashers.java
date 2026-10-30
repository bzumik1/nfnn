package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.domain.PasswordHasher;
import org.springframework.beans.factory.config.BeanPostProcessor;

public class CachingPasswordHashers implements BeanPostProcessor {

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (bean instanceof PasswordHasher hasher && !(bean instanceof CachingPasswordHasher)) {
            return new CachingPasswordHasher(hasher);
        }
        return bean;
    }
}
