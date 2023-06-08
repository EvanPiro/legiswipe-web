module Bill exposing (BillRes, Model, Sponsor, blank, decoder, encode, toBillId, toUrl, view)

import Html.Styled exposing (Html, a, button, div, h1, h2, h3, h4, p, span, text)
import Html.Styled.Attributes exposing (class, css, href, target)
import Html.Styled.Events exposing (onClick)
import Json.Decode exposing (Decoder, field, int, list, map, map2, map3, map4, map5, map6, map7, maybe, string)
import Json.Encode as Encode exposing (encode, object)
import Tailwind.Utilities as T


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
    map7 Model
        (field "introducedDate" string)
        (field "sponsors" sponsorsDecoder)
        (maybe (field "policyArea" policyAreaDecoder))
        (field "title" string)
        (field "number" string)
        (field "type" string)
        (field "congress" int)


type alias BillRes =
    { bill : Model
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


view : msg -> Bool -> Model -> Html msg
view showSponsor sponsorShow bill =
    let
        sponsor =
            case sponsorShow of
                False ->
                    div [ css [ T.my_4 ] ] [ button [ onClick showSponsor ] [ text "Show Sponsor" ] ]

                True ->
                    sponsorsView bill.sponsors
    in
    div []
        [ h2 [ css [ T.justify_center, T.leading_relaxed ] ] [ text bill.title ]
        , sponsor
        , div [ css [ T.my_4 ] ] [ text <| "Introduced " ++ bill.introducedDate ]
        , div [ css [ T.my_4 ] ] [ a [ href <| toUrl bill, target "_blank" ] [ text "🔗 More info" ] ]
        ]


toBillId : Model -> String
toBillId model =
    String.fromInt model.congress ++ "-" ++ model.type_ ++ "-" ++ model.number


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
