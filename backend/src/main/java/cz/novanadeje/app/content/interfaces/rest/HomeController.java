package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.home.HomeContentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/content/home")
class HomeController {

    private final HomeContentService home;

    HomeController(HomeContentService home) {
        this.home = home;
    }

    @GetMapping
    HomeResponse read() {
        return HomeResponse.from(home.read());
    }
}
