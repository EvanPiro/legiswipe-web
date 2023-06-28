module Bill exposing (BillRes, Model, Sponsor, blank, decoder, encode, toBillId, toJsonFromIds, toUrl, view)

import Html.Styled exposing (Html, a, button, div, h1, h2, h3, h4, p, span, text)
import Html.Styled.Attributes exposing (class, css, href, target)
import Html.Styled.Events exposing (onClick)
import Json.Decode exposing (Decoder, field, int, list, map, map2, map3, map4, map5, map6, map7, map8, maybe, string)
import Json.Encode as Encode exposing (encode, object)
import Tailwind.Utilities as T
import Url.Builder as Url


type alias PolicyArea =
    { name : String }


encodePolicyArea : PolicyArea -> Encode.Value
encodePolicyArea { name } =
    Encode.object [ ( "name", Encode.string name ) ]


type alias Request =
    { billNumber : String
    , billType : String
    , congress : String
    }


requestDecoder : Decoder Request
requestDecoder =
    map3 Request
        (field "billNumber" string)
        (field "billType" string)
        (field "congress" string)


policyAreaDecoder : Decoder PolicyArea
policyAreaDecoder =
    map PolicyArea (field "name" string)


type alias Sponsor =
    { firstName : String
    , lastName : String
    , party : String
    , fullName : String
    }


type alias LatestAction =
    { actionDate : String
    , text : String
    }


latestActionDecoder : Decoder LatestAction
latestActionDecoder =
    map2 LatestAction (field "actionDate" string) (field "text" string)


sponsorsDecoder : Decoder (List Sponsor)
sponsorsDecoder =
    list <|
        map4 Sponsor
            (field "firstName" string)
            (field "lastName" string)
            (field "party" string)
            (field "fullName" string)


type alias Model =
    { introducedDate : String
    , sponsors : List Sponsor
    , policyArea : Maybe PolicyArea
    , title : String
    , number : String
    , type_ : String
    , congress : Int
    , latestAction : LatestAction
    }


blank : String -> String -> Model
blank number type_ =
    { introducedDate = ""
    , sponsors = []
    , policyArea = Nothing
    , title = ""
    , number = number
    , type_ = type_
    , congress = 0
    , latestAction = { text = "", actionDate = "" }
    }


encode : Model -> Encode.Value
encode bill =
    Encode.object
        [ ( "introducedDate", Encode.string bill.introducedDate )
        , ( "sponsors", Encode.list encodeSponsor bill.sponsors )
        , ( "title", Encode.string bill.title )
        , ( "number", Encode.string bill.number )
        , ( "type", Encode.string bill.type_ )
        , ( "congress", Encode.int bill.congress )
        ]


encodeSponsor : Sponsor -> Encode.Value
encodeSponsor { firstName, lastName, party, fullName } =
    Encode.object
        [ ( "firstName", Encode.string firstName )
        , ( "lastName", Encode.string lastName )
        , ( "party", Encode.string party )
        , ( "fullName", Encode.string fullName )
        ]


billDecoder : Decoder Model
billDecoder =
    map8 Model
        (field "introducedDate" string)
        (field "sponsors" sponsorsDecoder)
        (maybe (field "policyArea" policyAreaDecoder))
        (field "title" string)
        (field "number" string)
        (field "type" string)
        (field "congress" int)
        (field "latestAction" latestActionDecoder)


type alias BillRes =
    { bill : Model
    , request : Request
    }


decoder : Decoder BillRes
decoder =
    map2 BillRes
        (field "bill" billDecoder)
        (field "request" requestDecoder)


latestActionView : Model -> Html msg
latestActionView model =
    div []
        [ text <| "Last Action: " ++ model.latestAction.text
        ]


sponsorsView : Model -> Html msg
sponsorsView bill =
    div [ css [ T.my_4 ] ]
        [ span [] [ text "Sponsors: " ]
        , span [] <|
            List.map (\{ fullName } -> span [] [ text fullName ]) bill.sponsors
        ]


view : Model -> Html msg
view bill =
    div []
        [ h2 [ css [ T.justify_center, T.leading_relaxed ] ] [ text bill.title ]
        , sponsorsView bill
        , latestActionView bill
        , div [ css [ T.my_4 ] ] [ text <| "Introduced " ++ bill.introducedDate ]
        , div [ css [ T.my_4 ] ] [ a [ href <| toUrl bill, target "_blank" ] [ text "🔗 More info" ] ]
        ]


toBillId : Model -> String
toBillId model =
    String.fromInt model.congress ++ "-" ++ model.type_ ++ "-" ++ model.number


toJsonUrl : String -> Model -> String
toJsonUrl apiKey model =
    Url.crossOrigin
        "https://api.congress.gov"
        [ "v3"
        , "bill"
        , String.fromInt model.congress
        , String.toLower model.type_
        , model.number
        ]
        [ Url.string "format" "json"
        , Url.string "apiKey" apiKey
        ]


toJsonFromIds : String -> String -> String -> String
toJsonFromIds apiKey type_ number =
    Url.crossOrigin
        "https://api.congress.gov"
        [ "v3"
        , "bill"
        , String.fromInt 118
        , String.toLower type_
        , number
        ]
        [ Url.string "format" "json"
        , Url.string "api_key" apiKey
        ]


toUrl : Model -> String
toUrl bill =
    case ( bill.type_, bill.congress ) of
        -- Senate
        ( "S", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/senate-bill/" ++ bill.number

        -- House joint resolution
        ( "HJRES", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/house-joint-resolution/" ++ bill.number

        -- Senate resolution
        ( "SRES", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/senate-resolution/" ++ bill.number

        -- House bill
        ( "HR", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/house-bill/" ++ bill.number

        -- House resolution
        ( "HRES", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/house-resolution/" ++ bill.number

        ( a, b ) ->
            "bill type: " ++ a ++ "; congress: " ++ String.fromInt bill.congress ++ "; " ++ "number: " ++ bill.number
