port module Main exposing (Model, Msg(..), init, main, update, view)

import Api
import Bill exposing (Bill, BillRes)
import BillMetadata exposing (BillMetadata, BillMetadataRes)
import Browser
import Html exposing (Html, a, button, div, h1, img, p, text)
import Html.Attributes exposing (class, href, src)
import Html.Events exposing (onClick)
import Http as Http exposing (Error(..))
import Json.Decode as Decoder exposing (Decoder)
import List exposing (head)


port cache : Model -> Cmd msg



---- MODEL ----


type alias Verdict =
    ( Bill, Bool )


type alias Model =
    { activeBill : Maybe Bill
    , bills : List BillMetadata
    , verdicts : List Verdict
    , loading : Bool
    , next : String
    , apiKey : String
    , feedback : String
    }


type alias Flags =
    { apiKey : String
    , maybeModel : Maybe Model
    }


init : Flags -> ( Model, Cmd Msg )
init { apiKey, maybeModel } =
    case maybeModel of
        Nothing ->
            ( { activeBill = Nothing
              , bills = []
              , verdicts = []
              , loading = True
              , next = ""
              , apiKey = apiKey
              , feedback = ""
              }
            , Http.get
                { url = Api.url apiKey
                , expect = Http.expectJson GotBills BillMetadata.decoder
                }
            )

        Just model ->
            ( model, Cmd.none )


getNextBills : String -> String -> Cmd Msg
getNextBills key url =
    Http.get
        { url = Api.addKey key url
        , expect = Http.expectJson GotBills BillMetadata.decoder
        }



---- UPDATE ----


type Msg
    = GotBills (Result Http.Error BillMetadataRes)
    | GotBill (Result Http.Error BillRes)
    | SetVerdict Bill Bool


getBill : String -> BillMetadata -> Cmd Msg
getBill key { url } =
    Http.get
        { url = Api.addKey key url
        , expect = Http.expectJson GotBill Bill.decoder
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        GotBills res ->
            let
                bills =
                    res
                        |> Result.map (\b -> b.bills)
                        |> Result.withDefault []

                next =
                    res
                        |> Result.map (\b -> b.pagination)
                        |> Result.map (\b -> b.next)
                        |> Result.withDefault ""

                reqCmd =
                    case List.head bills of
                        Just bill ->
                            getBill model.apiKey bill

                        _ ->
                            Cmd.none

                newModel =
                    { model | bills = bills, next = next }
            in
            ( newModel, Cmd.batch [ cache newModel, reqCmd ] )

        GotBill res ->
            case res of
                Err err ->
                    let
                        errorStr =
                            case err of
                                BadBody str ->
                                    str

                                _ ->
                                    "other error"
                    in
                    ( { model | feedback = errorStr }, Cmd.none )

                Ok ok ->
                    let
                        newModel =
                            { model | activeBill = Just ok.bill }
                    in
                    ( newModel, cache newModel )

        SetVerdict bill bool ->
            let
                newBills =
                    List.filter (\{ number } -> bill.number /= number) model.bills

                reqCmd =
                    case List.head newBills of
                        Just billMetadata ->
                            getBill model.apiKey billMetadata

                        _ ->
                            getNextBills model.apiKey model.next

                newModel =
                    { model
                        | bills = newBills
                        , activeBill = Nothing
                        , loading = True
                        , verdicts = [ ( bill, bool ) ] ++ model.verdicts
                    }
            in
            ( newModel
            , Cmd.batch [ cache newModel, reqCmd ]
            )



---- VIEW ----


stats : Model -> Html Msg
stats model =
    let
        yesCount =
            String.fromInt <| List.length <| List.filter (\( _, n ) -> n == True) model.verdicts

        noCount =
            String.fromInt <| List.length <| List.filter (\( _, n ) -> n == False) model.verdicts
    in
    div [ class "flex" ]
        [ div [] [ text <| "Rejected: " ++ noCount ], div [] [ text <| "Accepted: " ++ yesCount ] ]


view : Model -> Html Msg
view model =
    div [ class "mt-1" ]
        [ div [] [ text model.feedback ]
        , case model.activeBill of
            Nothing ->
                div [] [ text "Loading bill..." ]

            Just bill ->
                div []
                    [ yesNo bill
                    , Bill.view bill
                    ]
        ]


yesNo : Bill -> Html Msg
yesNo bill =
    div [ class "flex" ]
        [ button [ class "btn", onClick <| SetVerdict bill False ] [ text "❌" ]
        , button [ class "btn", onClick <| SetVerdict bill True ] [ text "✅" ]
        ]



---- PROGRAM ----


main : Program Flags Model Msg
main =
    Browser.element
        { view = view
        , init = init
        , update = update
        , subscriptions = always Sub.none
        }
