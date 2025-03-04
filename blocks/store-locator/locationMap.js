/* eslint-disable */
import { h, render, Component } from '../../scripts/__dropins__/tools/preact.js';
import htm from '../../scripts/htm.js';
const html = htm.bind(h);
const GOOGLE_MAP_KEY='AIzaSyB4er8NcF-CGHY4ELZbqMlqzAkgsyt798g';

class LocationMap extends Component {

  componentDidMount() {
    this.loadGoogleMapsApi().then(() => {
      this.map = new google.maps.Map(this.mapContainer, {
        center: { lat: -34.397, lng: 150.644 },
        zoom: 8,
        disableDefaultUI: true,
        keyboardShortcuts: false,
        styles: [
          {
            featureType: "all",
            stylers: [
              { saturation: -100 },
              { visibility : "simplified" }
            ]
          }
        ]
      });
      this.addPOIs(map);
      
    });
  }

  async addPOIs(map) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const marker = new AdvancedMarkerElement({
      map,
      position: { lat: -34.397, lng: 150.644 },
     });
  }

  loadGoogleMapsApi() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAP_KEY}`;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', resolve);
      document.body.appendChild(script);
    });
  }


  handleSearchClick() {
    alert('Hold up.. no searching just yet!');
  }

  render(props) {
    return html`
    <div className="shopfinder">
        <div className="sidepanel">
          <h1 className="sidepanel__title">${props.heading}</h1>
          <div className="search">
            <p className="search__title">Find another location</p>
            <div className="search__box">
               <input className="search__input" type="text" placeholder="Post Code" name="search"></input>
               <button className="search__button" onClick=${this.handleSearchClick}>Search</button>
            </div>
          </div>
        </div>
        <div className="map" ref=${el => this.mapContainer = el}>
        </div>
    </div>
    `;
  }
}

export default LocationMap;