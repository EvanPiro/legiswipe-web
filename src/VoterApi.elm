module VoterApi exposing (Voter, decoder, encode, path, request)

import Http
import Json.Decode exposing (Decoder, field, int, map3, maybe, string)
import Json.Encode as Encode


path : String
path =
    "/.netlify/functions/voter"


type alias Voter =
    { firstName : String
    , canRedeem : Int
    , address : Maybe String
    }


decoder : Decoder Voter
decoder =
    map3 Voter
        (field "firstName" string)
        (field "canRedeem" int)
        (field "address" (maybe string))


encode : String -> Encode.Value
encode creds =
    Encode.object
        [ ( "credentials", Encode.string creds )
        ]


request : (Result Http.Error Voter -> msg) -> String -> Cmd msg
request toMsg creds =
    Http.post
        { url = path
        , body = Http.jsonBody <| encode creds
        , expect = Http.expectJson toMsg decoder
        }
