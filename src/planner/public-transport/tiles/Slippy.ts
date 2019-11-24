import ILocation from "../../../interfaces/ILocation";

/**
 * Utility class with tile functions
 */
export default class Slippy {

    public static tileToLon(tileX: number, zoom: number): number {
        return (tileX / Math.pow(2, zoom) * 360 - 180);
    }

    public static tileToLat(tileY: number, zoom: number): number {
        const n = Math.PI - 2 * Math.PI * tileY / Math.pow(2, zoom);
        return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
    }

    public static lonToTile(lon: number, zoom: number): number {
        return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
    }

    public static latToTile(lat: number, zoom: number): number {
        return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180)
            + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
    }

    public static getCenterOfTile(tileX: number, tileY: number, zoom: number): ILocation {
        const lat1 = Slippy.tileToLat(tileY, zoom);
        const lat2 = Slippy.tileToLat(tileY + 1, zoom);
        const lon1 = Slippy.tileToLon(tileX, zoom);
        const lon2 = Slippy.tileToLon(tileX + 1, zoom);

        return {
            latitude: (lat1 + lat2) / 2,
            longitude: (lon1 + lon2) / 2,
        };
    }

    public static getBBox(tileX: number, tileY: number, zoom: number): ILocation[] {
        const lat1 = Slippy.tileToLat(tileY, zoom);
        const lat2 = Slippy.tileToLat(tileY + 1, zoom);
        const lon1 = Slippy.tileToLon(tileX, zoom);
        const lon2 = Slippy.tileToLon(tileX + 1, zoom);

        return [
            { longitude: lon1, latitude: lat1 }, // TL
            { longitude: lon1, latitude: lat2 }, // BL
            { longitude: lon2, latitude: lat1 }, // TR
            { longitude: lon2, latitude: lat2 }, // BR
        ];
    }
  }
