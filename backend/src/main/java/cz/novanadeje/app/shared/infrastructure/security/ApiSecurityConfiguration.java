package cz.novanadeje.app.shared.infrastructure.security;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationManagers;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class ApiSecurityConfiguration {

    static final String ADMIN_ROLE = "ADMIN";
    private static final String BACKUP_DOWNLOAD = "/api/admin/operations/backups/*";
    private static final String BACKUP_RESTORE = "/api/admin/operations/backups/*/restore";
    private static final String[] BROWSER_ONLY_DELETES = {
            "/api/admin/donors/*",
            "/api/admin/donors/administrators/*",
            "/api/admin/donors/*/passkeys",
            "/api/admin/content/news/*",
            "/api/admin/content/projects/*",
            "/api/admin/donations/donors/*/bank-accounts/*",
            "/api/admin/donations/symbol-claims/*",
            "/api/admin/donations/receipt-signatures/*"};
    private static final String[] BROWSER_ONLY_POSTS = {
            "/api/admin/donors/administrators",
            "/api/admin/donors/*/second-factor/reset",
            "/api/admin/donations/symbol-claims/*/reverse",
            "/api/admin/donations/receipt-signatures/*",
            "/api/admin/donations/receipt-signing-keys/*/withdrawal",
            "/api/admin/operations/backups/key/reveal",
            "/api/admin/operations/backups/key/confirmation"};
    private static final String[] BROWSER_ONLY_PUTS = {
            "/api/admin/donations/receipt-signatory"};

    private static final String[] BROWSER_ONLY_GETS = {
            "/api/admin/donations/receipt-signatures/*",
            "/api/admin/donations/receipt-images/*"};

    @Bean
    SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, ProblemDetailSecurityErrorHandler errorHandler,
                                               JwtAuthenticationConverter jwtAuthenticationConverter) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/contact/messages").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/operations/client-errors").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/donations/payment-details").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/donations/receipt-keys").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/donations/receipts/status").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/content/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/donors/auth/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/donors/company-lookup").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/operations/setup", "/api/operations/setup/backup-key").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/operations/setup", "/api/operations/setup/unlock", "/api/operations/setup/test-email").permitAll()
                        .requestMatchers(HttpMethod.PUT, "/api/operations/setup/restore").permitAll()
                        .requestMatchers(HttpMethod.GET, "/.well-known/oauth-authorization-server").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/donors/oauth/token").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers(HttpMethod.GET, BACKUP_DOWNLOAD).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.HEAD, BACKUP_DOWNLOAD).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.POST, BACKUP_RESTORE).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.DELETE, BROWSER_ONLY_DELETES).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.POST, BROWSER_ONLY_POSTS).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.PUT, BROWSER_ONLY_PUTS).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.GET, BROWSER_ONLY_GETS).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.HEAD, BROWSER_ONLY_GETS).access(administratorInBrowser())
                        .requestMatchers(HttpMethod.GET, "/api/admin/**").hasRole(ADMIN_ROLE)
                        .requestMatchers(HttpMethod.HEAD, "/api/admin/**").hasRole(ADMIN_ROLE)
                        .requestMatchers("/api/admin/**").access(new AdminWriteAuthorizationManager())
                        .anyRequest().access(new BrowserSessionAuthorizationManager()))
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
                        .authenticationEntryPoint(errorHandler)
                        .accessDeniedHandler(errorHandler))
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(errorHandler)
                        .accessDeniedHandler(errorHandler))
                .build();
    }

    private static AuthorizationManager<RequestAuthorizationContext> administratorInBrowser() {
        return AuthorizationManagers.allOf(AuthorityAuthorizationManager.hasRole(ADMIN_ROLE), new BrowserSessionAuthorizationManager());
    }
}
