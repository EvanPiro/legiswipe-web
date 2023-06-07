module AddressApi exposing (Address, encode, path, request)

import Http
import Json.Decode exposing (Decoder, field, map, string)
import Json.Encode as Encode


path : String
path =
    "/.netlify/functions/address"


type alias Address =
    { address : String
    }


decoder : Decoder Address
decoder =
    map Address
        (field "address" string)


encode : String -> String -> Encode.Value
encode creds address =
    Encode.object
        [ ( "credentials", Encode.string creds )
        , ( "address", Encode.string address )
        ]


request : (Result Http.Error Address -> msg) -> String -> String -> Cmd msg
request toMsg creds address =
    Http.post
        { url = path
        , body = Http.jsonBody <| encode creds address
        , expect = Http.expectJson toMsg decoder
        }
