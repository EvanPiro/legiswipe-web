module Bill exposing (Bill, BillRes, Sponsor, decoder, toUrl, view)

import Html exposing (Html, a, div, h1, h2, h3, h4, p, span, text)
import Html.Attributes exposing (class, href, target)
import Json.Decode exposing (Decoder, field, int, list, map, map2, map3, map4, map5, map6, map7, maybe, string)


type alias PolicyArea =
    { name : String }


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


sponsorsDecoder : Decoder (List Sponsor)
sponsorsDecoder =
    list <|
        map4 Sponsor
            (field "firstName" string)
            (field "lastName" string)
            (field "party" string)
            (field "fullName" string)


type alias Bill =
    { introducedDate : String
    , sponsors : List Sponsor
    , policyArea : Maybe PolicyArea
    , title : String
    , number : String
    , type_ : String
    , congress : Int
    }


billDecoder : Decoder Bill
billDecoder =
    map7 Bill
        (field "introducedDate" string)
        (field "sponsors" sponsorsDecoder)
        (maybe (field "policyArea" policyAreaDecoder))
        (field "title" string)
        (field "number" string)
        (field "type" string)
        (field "congress" int)


type alias BillRes =
    { bill : Bill
    , request : Request
    }


decoder : Decoder BillRes
decoder =
    map2 BillRes
        (field "bill" billDecoder)
        (field "request" requestDecoder)


sponsorsView : List Sponsor -> Html msg
sponsorsView sponsors =
    div []
        [ span [] [ text "Sponsors: " ]
        , span [] <|
            List.map (\{ fullName } -> span [] [ text fullName ]) sponsors
        ]


view : Bill -> Html msg
view bill =
    div []
        [ h2 [] [ text bill.title ]
        , sponsorsView bill.sponsors
        , div [ class "mt-1" ] [ text <| "Introduced " ++ bill.introducedDate ]
        , div [ class "mt-1" ] [ a [ href <| toUrl bill, target "_blank" ] [ text "🔗 More info" ] ]
        ]


toUrl : Bill -> String
toUrl bill =
    case ( bill.type_, bill.congress ) of
        -- Senate
        ( "S", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/senate-bill/" ++ bill.number

        -- House Joint Resolution
        ( "HJRES", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/house-joint-resolution/" ++ bill.number

        -- Senate resolution
        ( "SRES", 118 ) ->
            "https://www.congress.gov/bill/118th-congress/senate-resolution/" ++ bill.number

        ( a, b ) ->
            "bill type: " ++ a ++ "; congress: " ++ String.fromInt bill.congress ++ "; " ++ "number: " ++ bill.number
