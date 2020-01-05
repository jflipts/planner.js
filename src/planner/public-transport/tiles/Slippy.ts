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

    // AABB - line segment intersection test
    public static intersects(tile: { x, y, zoom }, line: { x1, y1, x2, y2 }): boolean {
        const bbox = Slippy.getBBox(tile.x, tile.y, tile.zoom);

        let above = 0;
        bbox.forEach((element) => {
            const f = (line.y2 - line.y1) * element.longitude
                + (line.x1 - line.x2) * element.latitude
                + (line.x2 * line.y1 - line.x1 * line.y2);
            if (f === 0) {
                return true;
            } else if (f > 0) {
                above += 1;
            } else {
                above -= 1;
            }
        });

        if (above === 4 || above === -4) {
            return false;
        } else {
            const BL = bbox[1];
            const TR = bbox[2];

            if (
                (line.x1 > TR.longitude && line.x2 > TR.longitude) ||
                (line.x1 < BL.longitude && line.x2 < BL.longitude) ||
                (line.y1 > TR.latitude && line.y2 > TR.latitude) ||
                (line.y1 < BL.latitude && line.y2 < BL.latitude)
            ) {
                return false;
            }
        }
        return true;
    }
  }
