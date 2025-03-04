export async function initMap(map, locations) {
  // eslint-disable-next-line no-undef
  const { Map } = await google.maps.importLibrary('maps');

  const options = { credentials: 'include' };
  const locationReq = await fetch('/locations.json', options);
  const locationsJson = await locationReq.json();
  locations = locationsJson ? locationsJson.data : [];
  const firstLocation = locations ? locations[0] : { lat: "-34.397", long: "150.644" };

  map = new Map(document.getElementById('locator-map'), {
    // center: { lat: parseFloat(firstLocation.lat), lng: parseFloat(firstLocation.long) },
    center: { lat: -34.397, lng: 150.644 },
    zoom: 8,
    mapId: '4504f8b37365c3d0',
    disableDefaultUI: true,
    keyboardShortcuts: false,
    styles: [
      {
        featureType: 'all',
        stylers: [
          { lightness: -5 },
          { saturation: -100 },
          { visibility: 'simplified' },
        ],
      },
    ],
  });
  // eslint-disable-next-line no-undef
  const infoWindow = new google.maps.InfoWindow({
    map,
  });

  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

  for (const location of locations) {
    const AdvancedMarkerElement = new google.maps.marker.AdvancedMarkerElement({
      map,
      content: buildContent(location),
      position: { lat: parseFloat(location.lat), lng: parseFloat(location.long) },
      title: location.locationName,
    });

    AdvancedMarkerElement.addListener("click", () => {
      toggleHighlight(AdvancedMarkerElement, location);
    });
  }

  // const marker = new AdvancedMarkerElement({
  //   map,
  //   position: { lat: parseFloat(firstLocation.lat), lng: parseFloat(firstLocation.long) },
  // });

  return {map: map, locations: locations};

}

function toggleHighlight(markerView) {
  if (markerView.content.classList.contains("highlight")) {
    markerView.content.classList.remove("highlight");
    markerView.zIndex = null;
  } else {
    markerView.content.classList.add("highlight");
    markerView.zIndex = 1;
  }
}

function buildContent(cafe) {
  const content = document.createElement("div");

  content.classList.add("property");
  content.innerHTML = `
    <div class="icon-map">
        <i aria-hidden="true" class="fa-solid fa-mug-saucer" title="cafe"></i>
        <span class="fa-sr-only">cafe</span>
    </div>
    <div class="details">
        <div class="price">${cafe.locationName} - ${cafe.city}</div>
        <div class="address">${cafe.streetAddress}, ${cafe.city}, ${cafe.postzipCode}</div>
        <div class="features">
          <div>
              <i aria-hidden="true" class="fa fa-phone fa-lg phone" title="phone"></i>
              <span class="fa-sr-only">phone</span>
              <span>${cafe.phoneNumber}</span>
          </div>
        </div>
    </div>
    `;
  return content;
}

function handleClick(map, locations) {
  alert("I'm here");
}

export default function decorate(block) {

  let map = null;
  let locations = [];

  const pText = block.querySelector('p').textContent;
  block.textContent = '';
  
  const locatorDOM = document.createRange().createContextualFragment(`
  <div class="shopfinder">
    <div class="sidepanel">
      <h3 class="sidepanel__title">Try a new roast at a Fréscopa near you!</h3>
    <div class="search">
      <p class="search__title">Find another location</p>
      <div class="search__box">
        <input id="search-input" class="search__input" type="text" placeholder="Post Code" name="search"></input>
        <button id="search-button" class="search__button">Search</button>
      </div>
    </div>
    </div>
      <div class="map" id="locator-map">
    </div>
  </div>
  `);

  window.initMap = async () => {
    const res = await initMap(map, locations);
    document.getElementById('search-button').addEventListener('click', function(){
      const postcode = document.getElementById('search-input').value;
      for (const location of res.locations) {
        if(location.postzipCode === postcode) {
          res.map.setCenter({lat: parseFloat(location.lat), lng: parseFloat(location.long)})
        }
      }
   })
  };

  block.append(locatorDOM);
}
