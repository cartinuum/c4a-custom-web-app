# Connect for ArcGIS - Working with the API 

This file provides some basic information on fetching information from a Connect for ArcGIS Layer Link.

## Authenticate

For this project we will be using anonymous mode. This uses a token that does not include an ArcGIS authentication token.

### Get Bearer Token

POST https://app.cartinuum.com/connect/au/api/auth/authenticate

**Body**

```{ "portalUrl":"https://my-org.maps.arcgis.com" }```

**Example Response**

```{"jwt":"REDACTED","loggedInAs":"anonymous"}```

This token is sent as a Bearer token on all future requests

```Authorization: Bearer REDACTED```

## Get Available Layer Links

A layer link describes a relationship between features on a map and records stored in a connected business system.

GET https://app.cartinuum.com/connect/au/api/community/layer-links

**Query Parameters**

* `featureLayerId` - (optional) return layer links for this feature layer ID. Used to find only the layer links that match layers in the map.

* `dataSourceId` - (optional) return layer links for this data source ID only.

* `fields` - (optional) describes the list of fields to be returned on the result.

Available values for the `fields` parameter: 
* `featureLayerId` - The portal ID of feature service used in this layer link.
* `subLayerId` - The subLayerId of the layer within the feature service.
* `queryResultAttrs` - A list of attributes that can be returned by this layer link query.
* `queryParameters` - The attributes required as inputs to a layer link query.
* `subLayerName` - Friendly name of the sub-layer.
* `hasAccess` - Boolean value indicating if the authenticated user is able to use this layer link.

**Example Response**

```json
{
  "layerLinks": [
    {
      "id": 877,
      "name": "My MS SQL Server",
      "featureLayerId": "9bcb26a....",
      "subLayerId": 0,
      "subLayerName": "Props",
      "queryParameters": [
        "Property_ID"
      ],
      "queryResultAttrs": [
        {
          "name": "property_id",
          "type": "string"
        },
        {
          "name": "number_field",
          "type": "string"
        }
      ],
      "lastUsedAt": "2026-04-08T01:08:11.696Z",
      "hasAccess": true
    }
  ],
  "totalItems": 1
}
```

## Query A Layer Link

Query a layer link by passing in features from the ArcGIS feature layer and returning values from the linked business system.

POST https://app.cartinuum.com/connect/au/api/community/query

**Body**

```json
{
    "layerLinkId": 877,
    "queryParameters": [
        "OBJECTID",
        "Property_ID"
    ],
    "features": [
        [
            "1",
            "2090249"
        ]
    ],
    "outFields": [
        "property_id",
        "number_field"
    ]
}
```

* `layerLinkId` - the ID of the layer link being queried.

* `queryParameters` - an array of the feature attributes being passed into the query. Must include the `queryParameters` requested by the layer link definition and the feature's primary key (object ID).

* `features` - an array of arrays. Each item is a map feature. Each inner-item is the attribute values strictly matching the order of the `queryParameters` array.

* `outFields` - an array formed from a subset of the `queryResultAttrs.name` values in the layer link definition.

**Example Response**

```json
{
    "fields": [
        "property_id",
        "number_field"
    ],
    "features": [
        {
            "feature": {
                "attributes": {
                    "OBJECTID": "1",
                    "Property_ID": "2090249"
                }
            },
            "results": [
                {
                    "property_id": "2090249",
                    "number_field": 123
                }
            ],
            "objectIdFieldValue": "1"
        }
    ],
    "__cache__": "none"
}
```

* `fields` - the list of fields being returned. This might differ from the `outFields` passed into the request if fields are not available for any reason.

* `features` - an array matching the features passed into the request. Each returned array item includes a `feature` that matches the requested attributes and an array of zero-to-many `results` each containing the query results for the feature.

* `__cache__` - an indicator of whether the results have been requested fresh or are from the Connect for ArcGIS cache.

