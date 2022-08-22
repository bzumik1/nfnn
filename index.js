import animateScrollTo from 'animated-scroll-to';

//SMOOTH SCROLL
export function smoothScroll(id){
    console.log("Smooth controll was called");
    animateScrollTo(document.querySelector(id),{
        cancelOnUserAction: false,
        minDuration: 1000,
        speed: 1300 // Duration of the scroll per 1000px
    });
}
//scroll on header
let header = document.getElementById("header");
var wasNotTriggered = true;
header.addEventListener('wheel', (event) => {
    let direction = event.deltaY;
    
    if(direction>0 && wasNotTriggered){
        wasNotTriggered = false
        console.log(`Scroll DOWN on heather happened, moving smoothly to #about-us section`);
        animateScrollTo(document.querySelector("#about-us"),{
            cancelOnUserAction: false,
            minDuration: 1000,
            speed: 1300 // Duration of the scroll per 1000px
        });
    }
});
window.addEventListener('wheel', (event) => {
    let direction = event.deltaY;
    
    if(direction<0 && !wasNotTriggered){
        wasNotTriggered = true;
        console.log(`Scroll UP happened, reseting wasNotTriggered to ${wasNotTriggered}`);
    }
});






//Set credentials
let year = new Date().getFullYear();
document.getElementById("footer-credits").innerHTML=`© ${year} Nová Naděje Nadační Fond, všechna práva vyhrazena.`



