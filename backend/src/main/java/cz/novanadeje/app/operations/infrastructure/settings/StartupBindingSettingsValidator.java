package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.SettingsValidator;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingProblem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationPropertiesBean;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
class StartupBindingSettingsValidator implements SettingsValidator {

    private static final String CANDIDATE_SOURCE = "candidateSettings";
    private static final String APPLICATION_PACKAGE = "cz.novanadeje.app.";
    private static final String MAIL_PREFIX = "spring.mail";

    private static final Logger log = LoggerFactory.getLogger(StartupBindingSettingsValidator.class);

    private final ApplicationContext context;
    private final ConfigurableEnvironment environment;

    StartupBindingSettingsValidator(ApplicationContext context, ConfigurableEnvironment environment) {
        this.context = context;
        this.environment = environment;
    }

    @Override
    public List<SettingError> validate(Map<Setting, String> stored, Map<Setting, String> candidate, Set<Setting> changed) {
        Collection<ConfigurationPropertiesBean> targets = targets();
        if (firstRefusal(candidate, targets).isEmpty()) {
            return List.of();
        }
        List<SettingError> errors = new ArrayList<>();
        for (Setting setting : changed) {
            Map<Setting, String> alone = new EnumMap<>(Setting.class);
            alone.putAll(stored);
            Optional.ofNullable(candidate.get(setting)).ifPresentOrElse(value -> alone.put(setting, value), () -> alone.remove(setting));
            if (firstRefusal(alone, targets).isPresent()) {
                errors.add(SettingError.of(setting, SettingProblem.REJECTED_AT_STARTUP));
            }
        }
        if (errors.isEmpty()) {
            errors.add(SettingError.ofWhole(SettingProblem.REJECTED_AT_STARTUP));
        }
        return errors;
    }

    private Collection<ConfigurationPropertiesBean> targets() {
        return ConfigurationPropertiesBean.getAll(context).values().stream()
                .filter(bean -> bean.getInstance().getClass().getName().startsWith(APPLICATION_PACKAGE)
                        || bean.getAnnotation().prefix().equals(MAIL_PREFIX))
                .toList();
    }

    private Optional<String> firstRefusal(Map<Setting, String> values, Collection<ConfigurationPropertiesBean> targets) {
        Binder binder = binderWith(values);
        for (ConfigurationPropertiesBean target : targets) {
            try {
                binder.bindOrCreate(target.getAnnotation().prefix(), Bindable.of(target.getInstance().getClass()));
            } catch (RuntimeException refused) {
                log.info("Candidate settings refused by {}: {}", target.getAnnotation().prefix(), refused.getClass().getSimpleName());
                return Optional.of(target.getAnnotation().prefix());
            }
        }
        return Optional.empty();
    }

    private Binder binderWith(Map<Setting, String> values) {
        MutablePropertySources sources = new MutablePropertySources();
        Map<String, Object> candidate = new LinkedHashMap<>();
        values.forEach((setting, value) -> candidate.put(setting.name(), value));
        sources.addFirst(new MapPropertySource(CANDIDATE_SOURCE, candidate));
        for (PropertySource<?> source : environment.getPropertySources()) {
            if (!source.getName().equals(DatabaseSettingsEnvironmentPostProcessor.SOURCE_NAME)
                    && !ConfigurationPropertySources.isAttachedConfigurationPropertySource(source)) {
                sources.addLast(source);
            }
        }
        return new Binder(ConfigurationPropertySources.from(sources), new PropertySourcesPlaceholdersResolver(sources));
    }
}
