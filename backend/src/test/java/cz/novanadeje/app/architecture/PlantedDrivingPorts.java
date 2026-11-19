package cz.novanadeje.app.architecture;

import java.util.Map;

final class PlantedDrivingPorts {

    static final Map<String, String> SOURCES = Map.of(
            "cz.novanadeje.app.donations.application.PlantedImportOutcomes", """
                    package cz.novanadeje.app.donations.application;

                    public interface PlantedImportOutcomes {
                        void recorded();
                    }
                    """,
            "cz.novanadeje.app.donations.application.PlantedImportService", """
                    package cz.novanadeje.app.donations.application;

                    @org.springframework.stereotype.Service
                    public class PlantedImportService {
                        public void importAll() {
                        }
                    }
                    """,
            "cz.novanadeje.app.donations.infrastructure.fio.FioImportScheduler", """
                    package cz.novanadeje.app.donations.infrastructure.fio;

                    import cz.novanadeje.app.donations.application.PlantedImportOutcomes;
                    import cz.novanadeje.app.donations.application.PlantedImportService;
                    import cz.novanadeje.app.donations.application.importing.BankImportRequests;
                    import cz.novanadeje.app.donations.application.importing.HistoryImportRun;

                    public class FioImportScheduler implements BankImportRequests, PlantedImportOutcomes {

                        private final PlantedImportService service;

                        public FioImportScheduler(PlantedImportService service) {
                            this.service = service;
                        }

                        public void requestImport() {
                            service.importAll();
                        }

                        public boolean inProgress() {
                            return false;
                        }

                        public boolean enabled() {
                            return true;
                        }

                        public void requestHistoryImport(HistoryImportRun run) {
                        }

                        public void recorded() {
                            service.importAll();
                        }
                    }
                    """,
            "cz.novanadeje.app.donations.infrastructure.fio.PlantedImportWiring", """
                    package cz.novanadeje.app.donations.infrastructure.fio;

                    import cz.novanadeje.app.donations.application.PlantedImportService;

                    @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
                    public class PlantedImportWiring {

                        @org.springframework.context.annotation.Bean
                        FioImportScheduler scheduler(PlantedImportService service) {
                            return new FioImportScheduler(service);
                        }
                    }
                    """);

    private PlantedDrivingPorts() {
    }
}
